"""Lossless Meshopt packing; no quantization, remeshing, or vertex changes.

Runs in Blender's Python to use its already installed meshoptimizer library.
Keeps an uncompressed audit copy outside public/. Decoded bytes are verified
with Three.js's own decoder by verify-revision7.mjs.
"""
import json, struct
from pathlib import Path
import numpy as np
from io_scene_gltf2.io.exp.meshopt import MeshoptEncoder

ROOT=Path(__file__).resolve().parent.parent
path=ROOT/'public/models/revision7/tissuebox-r7.glb'
source=path.read_bytes()
size=struct.unpack_from('<I',source,12)[0]
doc=json.loads(source[20:20+size]); binary=source[28+size:]
assert 'EXT_meshopt_compression' not in doc.get('extensionsRequired',[]), 'Export an uncompressed derivative first; do not recompress the audit baseline'
(ROOT/'checks/revision7/tissuebox-r7-uncompressed.glb').write_bytes(source)
settings={'gltf_meshopt_extension':'EXT_meshopt_compression'}
indices={p['indices'] for m in doc['meshes'] for p in m['primitives']}
accessors={a['bufferView']:(i,a) for i,a in enumerate(doc['accessors']) if 'bufferView' in a}
packed=bytearray(); virtual=0
for i,view in enumerate(doc['bufferViews']):
    number,accessor=accessors[i]
    raw=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    count=accessor['count'];stride=len(raw)//count
    assert len(raw)==count*stride and not accessor.get('byteOffset'), 'Unexpected interleaved accessor'
    if number in indices:
        data=np.frombuffer(raw,dtype={5123:'<u2',5125:'<u4'}[accessor['componentType']])
        compressed,_=MeshoptEncoder.encode_index_sequence(data,settings);mode='INDICES'
    else:
        data=np.frombuffer(raw,dtype=np.uint8).reshape(count,stride)
        compressed,_=MeshoptEncoder.encode_attribute('_LOSSLESS',data,stride,settings);mode='ATTRIBUTES'
    view['buffer']=1;view['byteOffset']=virtual
    view['extensions']={'EXT_meshopt_compression':{'buffer':0,'byteOffset':len(packed),
        'byteLength':len(compressed),'byteStride':stride,'count':count,'mode':mode,'filter':'NONE'}}
    virtual+=len(raw);virtual=(virtual+3)&~3
    packed.extend(compressed)
    packed.extend(b'\0'*((-len(packed))%4))
doc['buffers']=[{'byteLength':len(packed)},{'byteLength':virtual,'extensions':{'EXT_meshopt_compression':{'fallback':True}}}]
for key in ('extensionsUsed','extensionsRequired'):
    doc.setdefault(key,[]).append('EXT_meshopt_compression')
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
result=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(packed))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(packed),0x004e4942)+packed
path.write_bytes(result)
print('Lossless GLB',len(source),'->',len(result),'bytes',flush=True)
