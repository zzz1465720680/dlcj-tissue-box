"""Web derivative of the approved SAVED revision7 scene. Does not save a blend.

Evaluates its existing thickness/curves, retains Cut_pattern, all three UVs and
the R4/R7 physical hole metric. No model-generation scripts are imported.
The companion web shader evaluates the saved Blender mask and rim equations.
"""
import bpy, hashlib, json, re, struct
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT.parent / '14_纸巾盒三维模型/revision7/exports/tissuebox_revision7.blend'
OUT = ROOT / 'public/models/revision7'
CHECKS = ROOT / 'checks/revision7'
OUT.mkdir(parents=True, exist_ok=True)
CHECKS.mkdir(parents=True, exist_ok=True)
assert Path(bpy.data.filepath).resolve() == SOURCE.resolve(), 'Open the approved saved revision7 first'
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
protected = [SOURCE, ROOT/'public/models/tissuebox-v2.glb', ROOT/'.openai/hosting.json', ROOT/'app/api/designs/route.ts', ROOT/'app/chatgpt-auth.ts', ROOT/'lib/schema.ts', ROOT/'lib/design.ts']
before = {str(p): digest(p) for p in protected}

def values(collection, key, width, dtype=np.float32):
    a = np.empty(len(collection)*width, dtype=dtype)
    collection.foreach_get(key, a)
    return a.reshape(-1,width)

def body_metric(me):
    """Same tangent-metric definition, for the optional body perforation toggle."""
    me.calc_loop_triangles()
    idx=values(me.loop_triangles,'vertices',3,np.int32)
    loops=values(me.loop_triangles,'loops',3,np.int32)
    p=values(me.vertices,'co',3,np.float64)[idx]
    uv=values(me.uv_layers['HoleUV'].data,'uv',2,np.float64)[loops]*[.0024,.0042]
    dp=np.transpose(p[:,1:]-p[:,:1],(0,2,1))
    du=np.transpose(uv[:,1:]-uv[:,:1],(0,2,1))
    area=np.linalg.norm(np.cross(dp[:,:,0],dp[:,:,1]),axis=1)*.5
    valid=(abs(np.linalg.det(du))>1e-16)&(area>1e-14)
    j=dp[valid]@np.linalg.inv(du[valid]); g=np.transpose(j,(0,2,1))@j
    acc=np.zeros((len(me.vertices),2,2)); w=np.zeros(len(me.vertices))
    for k in range(3):
        np.add.at(acc,idx[valid,k],g*area[valid,None,None]);np.add.at(w,idx[valid,k],area[valid])
    good=w>1e-20;acc[good]/=w[good,None,None];acc[~good]=np.eye(2)
    return np.stack([acc[:,0,0],acc[:,0,1],acc[:,1,1]],axis=1).astype(np.float32)

originals=[o for o in bpy.context.scene.objects if o.get('part') and o.type in {'MESH','CURVE'}]
exported=[]; records=[]
for src in originals:
    name=src.name
    is_surface=src.type=='MESH' and bool(src.data.uv_layers.get('HoleUV'))
    if is_surface:
        metric=src.data.attributes.get('PerforationMetricR4')
        data=values(metric.data,'vector',3) if metric else body_metric(src.data)
        attr=src.data.attributes.new('_WEB_METRIC','FLOAT_VECTOR','POINT')
        attr.data.foreach_set('vector',data.ravel())
    # Optional label is exported even when hidden in the saved Blender render.
    src.hide_set(False);src.hide_viewport=False
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    mesh=bpy.data.meshes.new_from_object(src.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    if not len(mesh.polygons):
        bpy.data.meshes.remove(mesh)
        continue  # revision6's empty legacy arc curves, already part of the continuous rim
    formed=values(mesh.vertices,'co',3)
    flat=None
    if is_surface and src.data.shape_keys:
        key=src.data.shape_keys.key_blocks.get('Cut_pattern')
        if key:
            old=key.value;key.value=1
            bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
            flat_mesh=bpy.data.meshes.new_from_object(src.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
            assert len(flat_mesh.vertices)==len(mesh.vertices),name+' flat topology changed'
            flat=values(flat_mesh.vertices,'co',3)
            bpy.data.meshes.remove(flat_mesh);key.value=old;bpy.context.view_layer.update()
    src.name='__source__'+name
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    obj.matrix_world=src.matrix_world.copy()
    match=re.search(r'corner([0-3])',name)
    part='corner'+match[1] if match else 'trim' if 'trim' in name else 'label' if name=='label' else 'body'
    role='edge' if name.startswith('edge_') else 'thread' if name.startswith(('thread_','internal_')) else 'label' if name=='label' else 'surface'
    obj['part']=part;obj['role']=role;obj['sourceName']=name;obj['revision']=7
    obj['uvUsage']='TEXCOORD_0=ArtworkUV; TEXCOORD_1=GrainUV (40mm); TEXCOORD_2=HoleUV'
    if flat is not None:
        obj.shape_key_add(name='Formed')
        flat_key=obj.shape_key_add(name='Cut_pattern')
        flat_key.data.foreach_set('co',flat.ravel())
        flat_key.value=0.0
    mesh.calc_loop_triangles()
    record={'name':name,'part':part,'role':role,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),
            'uv':[u.name for u in mesh.uv_layers],'cut_pattern':flat is not None,
            'metric':'saved PerforationMetricR4' if is_surface and metric else 'body derived from saved HoleUV' if is_surface else None,
            'formed_sha256':hashlib.sha256(formed.tobytes()).hexdigest()}
    records.append(record);exported.append(obj)
    print('Prepared',name,record['triangles'],'triangles',flush=True)

# Runtime supplies editable materials. Named minimal materials keep inside suede
# separate without embedding duplicate textures or flattening customization.
for material in bpy.data.materials:
    material.use_nodes=True
    nodes=material.node_tree.nodes;nodes.clear()
    bsdf=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
bpy.ops.object.select_all(action='DESELECT')
for obj in exported: obj.select_set(True)
bpy.context.view_layer.objects.active=exported[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'tissuebox-r7.glb'),export_format='GLB',
    use_selection=True,use_visible=False,use_renderable=False,export_materials='EXPORT',
    export_texcoords=True,export_normals=True,export_attributes=True,export_extras=True,
    export_apply=False,export_morph=True,export_morph_normal=True,export_animations=False,
    export_cameras=False,export_lights=False,export_yup=True,export_shared_accessors=True)
assert before=={str(p):digest(p) for p in protected},'Protected file changed'
report={'source':str(SOURCE),'source_sha256':before[str(SOURCE)],'asset':'/models/revision7/tissuebox-r7.glb',
        'asset_bytes':(OUT/'tissuebox-r7.glb').stat().st_size,'asset_sha256':digest(OUT/'tissuebox-r7.glb'),
        'objects':records,'protected_files':before,'protected_files_unchanged':True,
        'perforation':{'method':'saved tangent metric evaluated by web GLSL; no UV re-unwrap',
                       'diameter_mm':.86,'pitch_x_mm':2.4,'row_pitch_mm':2.1,'rim_width_mm':.13},
        'no_geometry_simplification':True,'no_blend_saved':True}
(CHECKS/'export-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'manifest.json').write_text(json.dumps({k:v for k,v in report.items() if k not in {'protected_files','source','objects'}},indent=2),encoding='utf-8')
print('Export complete',report['asset_bytes'],'bytes',flush=True)
