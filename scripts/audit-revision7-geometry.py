"""Compare the export to the saved scene, including evaluated curves/thickness."""
import bpy, json, struct, hashlib
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
raw=(ROOT/'checks/revision7/tissuebox-r7-uncompressed.glb').read_bytes()
n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:]
def acc(i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']]
    return np.frombuffer(binary,dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']],count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
def values(c,k,w,dtype=np.float32):
    a=np.empty(len(c)*w,dtype);c.foreach_get(k,a);return a.reshape(-1,w)
def yup(a):return a[:,[0,2,1]]*[1,1,-1]
reports=[]
for node in g['nodes']:
    if 'mesh' not in node:continue
    name=node['extras']['sourceName'];obj=bpy.data.objects[name]
    obj.hide_set(False);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    me=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps);me.calc_loop_triangles()
    p=yup(values(me.vertices,'co',3));primitives=g['meshes'][node['mesh']]['primitives']
    gp=np.concatenate([acc(q['attributes']['POSITION']) for q in primitives])
    used=values(me.loops,'vertex_index',1,np.int32).ravel()
    expected=np.unique(p[used],axis=0);actual=np.unique(gp,axis=0)
    assert expected.shape==actual.shape,(name,'vertex set counts',expected.shape,actual.shape)
    error=float(np.max(abs(expected-actual)));assert error<1e-9,(name,'positions',error)
    count=sum(g['accessors'][q['indices']]['count']//3 for q in primitives)
    assert count==len(me.loop_triangles),(name,'triangle count')
    r={'object':name,'triangles':count,'max_position_error_m':error,'unreferenced_source_vertices':len(p)-len(np.unique(used))}
    if me.uv_layers.get('HoleUV'):
        # Match each glTF vertex back to an evaluated Blender loop. Index splitting
        # is allowed; material/normal boundaries can duplicate glTF vertices.
        loops=values(me.loops,'vertex_index',1,np.int32).ravel()
        keys=[tuple(v) for v in p]
        coord_to_loops={}
        for loop_index,idx in enumerate(loops):coord_to_loops.setdefault(keys[idx],[]).append(loop_index)
        gp0=acc(primitives[0]['attributes']['POSITION'])
        source_uvs=[values(me.uv_layers[u].data,'uv',2) for u in ['ArtworkUV','GrainUV','HoleUV']]
        for uv in source_uvs:uv[:,1]=1-uv[:,1]
        exported_uvs=[acc(primitives[0]['attributes'][f'TEXCOORD_{idx}']) for idx in range(3)]
        # Coincident seam vertices can intentionally carry different pattern UVs.
        # Select by the full UV tuple instead of overwriting one of the loops.
        source_uv=np.concatenate(source_uvs,axis=1);exported_uv=np.concatenate(exported_uvs,axis=1)
        metric=me.attributes.get('PerforationMetricR4')
        metric_data=values(metric.data,'vector',3) if metric else None
        gm=acc(primitives[0]['attributes']['_WEB_METRIC']) if metric else None
        li=[]
        for i,v in enumerate(gp0):
            candidates=coord_to_loops[tuple(v)]
            error=np.max(abs(source_uv[candidates]-exported_uv[i]),axis=1)
            if metric:
                error=error+np.max(abs(metric_data[loops[candidates]]-gm[i])/np.maximum(1,abs(gm[i])),axis=1)
            li.append(candidates[int(np.argmin(error))])
        li=np.array(li)
        uv_errors={}
        for idx,uvname in enumerate(['ArtworkUV','GrainUV','HoleUV']):
            expected_uv=source_uvs[idx][li]
            guv=acc(primitives[0]['attributes'][f'TEXCOORD_{idx}'])
            e=float(np.max(abs(expected_uv-guv)));assert e<2e-5,(name,uvname,e)
            uv_errors[uvname]=e
        if metric:
            expected_metric=metric_data[loops[li]]
            metric_error=float(np.max(abs(gm-expected_metric)));assert metric_error==0,(name,'metric',metric_error)
            r['saved_metric_max_error']=metric_error
        r['uv_max_errors']=uv_errors
        assert g['meshes'][node['mesh']]['weights']==[0]
        key=obj.data.shape_keys.key_blocks['Cut_pattern'];old=key.value;key.value=1
        bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
        flat=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
        source_flat=yup(values(flat.vertices,'co',3))
        expected_flat=source_flat[loops[li]]
        actual_flat=gp0+acc(primitives[0]['targets'][0]['POSITION'])
        delta=np.max(abs(expected_flat-actual_flat),axis=1)
        for i in np.where(delta>3e-8)[0]:
            candidates=coord_to_loops[tuple(gp0[i])]
            candidates=[j for j in candidates if np.max(abs(source_uv[j]-exported_uv[i]))<2e-5]
            delta[i]=min(float(np.max(abs(source_flat[loops[j]]-actual_flat[i]))) for j in candidates)
        e=float(np.max(delta));assert e<3e-8,(name,'morph',e)
        r['cut_pattern_max_error_m']=e
        bpy.data.meshes.remove(flat);key.value=old;bpy.context.view_layer.update()
    reports.append(r);bpy.data.meshes.remove(me)
report={'source':bpy.data.filepath,'passed':True,'objects':reports,'source_geometry_and_uv_preserved':True}
(ROOT/'checks/revision7/geometry-parity.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('Verified',len(reports),'objects, exact positions, UVs, saved metric and Cut_pattern',flush=True)
