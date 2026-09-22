"""Read the approved saved scene; never execute a historical build script."""
import bpy, json
from pathlib import Path

out = Path(__file__).resolve().parent.parent / 'checks' / 'revision7'
out.mkdir(parents=True, exist_ok=True)
report = {'file': bpy.data.filepath, 'objects': [], 'materials': [], 'export_options': {}}
for o in bpy.context.scene.objects:
    data = {'name': o.name, 'type': o.type, 'hide_render': o.hide_render,
            'hide_viewport': o.hide_viewport, 'dimensions': list(o.dimensions),
            'properties': {k: str(v) for k,v in o.items()},
            'modifiers': [{ 'name': m.name, 'type': m.type,
                **{k: getattr(m,k) for k in ('thickness','offset','material_offset','material_offset_rim','levels','render_levels') if hasattr(m,k)}} for m in o.modifiers]}
    if o.type == 'MESH':
        data.update(vertices=len(o.data.vertices), polygons=len(o.data.polygons),
                    uv=[u.name for u in o.data.uv_layers],
                    attributes=[{'name': a.name, 'type': a.data_type,'domain':a.domain} for a in o.data.attributes],
                    materials=[m.name if m else None for m in o.data.materials],
                    shapes=[{'name': k.name,'value':k.value} for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else [])
    report['objects'].append(data)
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nodes=[]
    for n in m.node_tree.nodes:
        nodes.append({'name':n.name,'type':n.type,
                      'image':n.image.name if n.type=='TEX_IMAGE' and n.image else None,
                      'uv_map':n.uv_map if n.type=='UVMAP' else None,
                      'attribute':n.attribute_name if n.type=='ATTRIBUTE' else None,
                      'inputs':{s.name: str(s.default_value) for s in n.inputs if not s.is_linked and hasattr(s,'default_value')}})
    report['materials'].append({'name':m.name,'nodes':nodes,'links':[[l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name] for l in m.node_tree.links]})
for p in bpy.ops.export_scene.gltf.get_rna_type().properties:
    report['export_options'][p.identifier] = p.description
(out/'scene-inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('Scene inspection saved:',out/'scene-inspection.json',flush=True)
