"""Bake short-range shading from the existing geometry without saving a model."""
import bpy, json, time, sys
from pathlib import Path
from mathutils import Vector

OUT=Path('G:/DLCJ/output/surface-refinement-20260929')
(OUT/'occlusion').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'bake-input.glb'))
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=16
scene.render.threads_mode='FIXED'
scene.render.threads=8
scene.render.bake.margin=12
scene.render.bake.use_clear=False
scene.render.bake.use_selected_to_active=False

meshes=[obj for obj in scene.objects if obj.type=='MESH']
surface=[obj for obj in meshes if obj.get('role')=='surface']
assert set(obj.get('part') for obj in surface)=={'body','corner0','corner1','corner2','corner3','trim'}
bpy.context.view_layer.update()
body_points=[obj.matrix_world @ vertex.co for obj in surface if obj.get('part')=='body' for vertex in obj.data.vertices]
lo=Vector(tuple(min(p[i] for p in body_points) for i in range(3)))
hi=Vector(tuple(max(p[i] for p in body_points) for i in range(3)))
center=(lo+hi)*.5
half=(hi-lo)*.5
hidden_image=bpy.data.images.new('hidden_faces',width=16,height=16,alpha=False)
hidden_image.colorspace_settings.name='Non-Color'

# Baking uses neutral emitters for every surface. Occlusion is geometry-only.
for obj in meshes:
    material=bpy.data.materials.new('AO_'+obj.name)
    material.use_nodes=True
    nodes=material.node_tree.nodes
    nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial')
    emission=nodes.new('ShaderNodeEmission')
    ao=nodes.new('ShaderNodeAmbientOcclusion')
    ao.inputs['Distance'].default_value=.0025
    ao.samples=16
    ao.only_local=False
    material.node_tree.links.new(ao.outputs['Color'],emission.inputs['Color'])
    material.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
    obj.data.materials.clear()
    obj.data.materials.append(material)
    # A closed leather piece has front and back faces sharing its flat UV.
    # Route inward-facing backs to a separate bake target so they cannot paint
    # solid darkness over the visible face. Positions and topology are untouched.
    hidden_material=material.copy()
    hidden_tex=hidden_material.node_tree.nodes.new('ShaderNodeTexImage')
    hidden_tex.image=hidden_image
    hidden_material.node_tree.nodes.active=hidden_tex
    obj.data.materials.append(hidden_material)
    normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
    for polygon in obj.data.polygons:
        point=obj.matrix_world @ polygon.center
        normal=(normal_matrix @ polygon.normal).normalized()
        relative=point-center
        outward=Vector(tuple((relative[i]/half[i])**7/half[i] for i in range(3))).normalized()
        polygon.material_index=1 if normal.dot(outward)<-.05 else 0
    if obj.data.uv_layers:
        obj.data.uv_layers.active_index=0
        obj.data.uv_layers[0].active_render=True

report=[]
parts=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['body','corner0','corner1','corner2','corner3']
for part in parts:
    selected=[obj for obj in surface if obj.get('part')==part]
    size=(1024,2048) if part=='body' else (1024,512) if part=='trim' else (512,1024)
    image=bpy.data.images.new('contact_'+part,width=size[0],height=size[1],alpha=False)
    image.generated_color=(1,1,1,1)
    image.colorspace_settings.name='Non-Color'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in selected:
        obj.select_set(True)
        nodes=obj.data.materials[0].node_tree.nodes
        texture=nodes.new('ShaderNodeTexImage')
        texture.image=image
        nodes.active=texture
        texture.select=True
    bpy.context.view_layer.objects.active=selected[0]
    started=time.time()
    bpy.ops.object.bake(type='EMIT')
    image.filepath_raw=str(OUT/'occlusion'/f'{part}.png')
    image.file_format='PNG'
    image.save()
    entry={'part':part,'size':size,'seconds':round(time.time()-started,2)}
    report.append(entry)
    print('CONTACT_BAKE '+json.dumps(entry),flush=True)
(OUT/'occlusion'/'bake-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('CONTACT_BAKE_COMPLETE',flush=True)
