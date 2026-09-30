"""Web derivative of the approved SAVED revision9 scene. Does not save a blend.

Evaluates the saved thickness/curves exactly as export-revision7.py did, and adds
the revision9 fixed-center perforation inputs:
  * `_WEB_SURFACE_POSITION` (glTF custom attribute, copied from the saved
    PerforationSurfacePositionR9 point attribute, which holds the ORIGINAL outer
    skin coordinates in Blender object meters; Solidify duplicates it to the
    inside shell).  `_WEB_METRIC` is still exported for the legacy body/trim branch.
  * one little-endian float32 RGBA binary per corner with the actual packed
    `R9_cornerN_fixed_centers` pixel array (row order preserved) plus JSON with
    the exact fix_holes.py grid origin/size.
No geometry, UV, normal or morph data is simplified, and the source is only read.
"""
import bpy, hashlib, json, math, re, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path('G:/DLCJ/14_纸巾盒三维模型/revision9/exports/tissuebox_revision9.blend')
SOURCE_SHA256 = 'e49b7ffe6edeb043efaf8a2abe237158db26d68eb3c6313e4a4b969fbd3351bc'
REV9 = Path('G:/DLCJ/14_纸巾盒三维模型/revision9')
SITE = ROOT
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
SOURCE = (Path(args[0]) if args else DEFAULT_SOURCE).resolve()
OUT = ROOT/'public/models/revision9'
CHECKS = ROOT/'checks/revision9'
OUT.mkdir(parents=True, exist_ok=True)
CHECKS.mkdir(parents=True, exist_ok=True)

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def values(collection, key, width, dtype=np.float32):
    a = np.empty(len(collection)*width, dtype)
    collection.foreach_get(key, a)
    return a.reshape(-1, width)

def f32(array):
    return np.ascontiguousarray(array, dtype='<f4')

def unique_sha(array, decimals=None):
    """Order independent digest, so glTF loop deduplication cannot break it."""
    data = np.unique(f32(array), axis=0)
    if decimals is not None:
        data = np.round(data.astype(np.float64), decimals).astype('<f4')
        data = np.unique(data, axis=0)
    return {'count': int(len(data)), 'sha256': hashlib.sha256(data.tobytes()).hexdigest()}

def sorted_sha(array, decimals=None):
    """Multiset digest in canonical (x,y,z) order."""
    data = f32(array).astype(np.float64)
    if decimals is not None:
        data = np.round(data, decimals)
    order = np.lexsort((data[:, 2], data[:, 1], data[:, 0]))
    return hashlib.sha256(f32(data[order]).tobytes()).hexdigest()

def yup(array):
    """Blender object space -> glTF Y-up, as the exporter transforms positions."""
    a = np.asarray(array, dtype=np.float64)
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], axis=1)

def body_metric(me):
    """Legacy tangent metric from the saved HoleUV, for the body/trim toggle."""
    me.calc_loop_triangles()
    idx = values(me.loop_triangles, 'vertices', 3, np.int32)
    loops = values(me.loop_triangles, 'loops', 3, np.int32)
    p = values(me.vertices, 'co', 3, np.float64)[idx]
    uv = values(me.uv_layers['HoleUV'].data, 'uv', 2, np.float64)[loops] * [.0024, .0042]
    dp = np.transpose(p[:, 1:] - p[:, :1], (0, 2, 1))
    du = np.transpose(uv[:, 1:] - uv[:, :1], (0, 2, 1))
    area = np.linalg.norm(np.cross(dp[:, :, 0], dp[:, :, 1]), axis=1) * .5
    valid = (abs(np.linalg.det(du)) > 1e-16) & (area > 1e-14)
    j = dp[valid] @ np.linalg.inv(du[valid])
    g = np.transpose(j, (0, 2, 1)) @ j
    acc = np.zeros((len(me.vertices), 2, 2)); w = np.zeros(len(me.vertices))
    for k in range(3):
        np.add.at(acc, idx[valid, k], g * area[valid, None, None])
        np.add.at(w, idx[valid, k], area[valid])
    good = w > 1e-20
    acc[good] /= w[good, None, None]
    acc[~good] = np.eye(2)
    return np.stack([acc[:, 0, 0], acc[:, 0, 1], acc[:, 1, 1]], axis=1).astype(np.float32)

def grid_bounds(uv_layer):
    """Exactly fix_holes.py: imin=floor(min u)-2 ... jmax=ceil(2*max v)+2."""
    uv = values(uv_layer.data, 'uv', 2, np.float64)
    imin = math.floor(float(uv[:, 0].min())) - 2; imax = math.ceil(float(uv[:, 0].max())) + 2
    jmin = math.floor(float(uv[:, 1].min()) * 2) - 2; jmax = math.ceil(float(uv[:, 1].max()) * 2) + 2
    return {'imin': imin, 'imax': imax, 'jmin': jmin, 'jmax': jmax,
            'nx': imax - imin + 1, 'ny': jmax - jmin + 1,
            'holeuv_min': [float(uv[:, 0].min()), float(uv[:, 1].min())],
            'holeuv_max': [float(uv[:, 0].max()), float(uv[:, 1].max())]}

def group_dump(group):
    links = [{'from': f'{l.from_node.name}.{l.from_socket.name}', 'to': f'{l.to_node.name}.{l.to_socket.name}'}
             for l in group.links]
    nodes = []
    for n in group.nodes:
        d = {'type': n.type, 'name': n.name}
        if n.type == 'MATH':
            d['operation'] = n.operation
            d['defaults'] = [float(i.default_value) for i in n.inputs if not i.is_linked]
            d['linked_inputs'] = [i.name for i in n.inputs if i.is_linked]
        elif n.type == 'TEX_IMAGE':
            d.update({'image': n.image.name if n.image else None,
                      'interpolation': n.interpolation, 'extension': n.extension})
        elif n.bl_idname == 'ShaderNodeVectorMath' or n.bl_idname == 'ShaderNodeVectorMath':
            d['operation'] = n.operation
        nodes.append(d)
    return {'group': group.name, 'nodes': nodes, 'links': links}

assert Path(bpy.data.filepath).resolve() == SOURCE, 'Open the approved saved revision9 first'
assert digest(SOURCE) == SOURCE_SHA256, 'Source blend hash differs from the approved revision9'
protected = [SOURCE, REV9/'checks/fixed-hole-centers.json',
             *sorted((REV9/'material_assets').glob('corner*_hole_centers.exr')),
             SITE/'public/models/revision7/tissuebox-r7.glb', SITE/'public/models/revision7/manifest.json',
             SITE/'lib/perforation.ts', SITE/'lib/product-assets.ts', SITE/'lib/product-materials.ts',
             SITE/'lib/design.ts', SITE/'lib/artwork.ts',
             ROOT/'lib/design.ts', ROOT/'lib/artwork.ts',
             ROOT/'scripts/export-revision7.py', REV9/'fix_holes.py']
before = {str(p): digest(p) for p in protected}
centers_audit = json.loads((REV9/'checks/fixed-hole-centers.json').read_text(encoding='utf8'))
report = {'source': str(SOURCE), 'source_sha256': before[str(SOURCE)], 'revision': 9,
          'asset': '/models/revision9/tissuebox-r9.glb', 'objects': [], 'atlases': {},
          'surface_position_attribute': '_WEB_SURFACE_POSITION',
          'perforation': {'method': 'saved r9 fixed-center atlas evaluated by web GLSL',
                          'diameter_mm': .86, 'pitch_x_mm': 2.4, 'row_pitch_mm': 2.1,
                          'rim_width_mm': .13, 'rim_depth': .55, 'mask_ramp_mm': .023,
                          'candidates_per_fragment': 9, 'distance_scale': 1000.0,
                          'atlas_space': 'Blender object meters, Z-up, no glTF frame conversion',
                          'body_trim_branch': 'legacy _WEB_METRIC tangent metric, unchanged'},
          'no_geometry_simplification': True, 'no_blend_saved': True}

originals = [o for o in bpy.context.scene.objects if o.get('part') and o.type in {'MESH', 'CURVE'}]
exported = []
skipped = []
for src in originals:
    name = src.name
    is_surface = src.type == 'MESH' and bool(src.data.uv_layers.get('HoleUV'))
    match = re.search(r'corner([0-3])', name)
    part = 'corner' + match[1] if match else 'trim' if 'trim' in name else 'label' if name == 'label' else 'body'
    role = 'edge' if name.startswith('edge_') else 'thread' if name.startswith(('thread_', 'internal_')) else 'label' if name == 'label' else 'surface'
    record = {'name': name, 'part': part, 'role': role}
    r9_source = None
    if is_surface:
        metric = src.data.attributes.get('PerforationMetricR4')
        data = values(metric.data, 'vector', 3) if metric else body_metric(src.data)
        attr = src.data.attributes.new('_WEB_METRIC', 'FLOAT_VECTOR', 'POINT')
        attr.data.foreach_set('vector', data.ravel())
        record['metric'] = 'saved PerforationMetricR4' if metric else 'body derived from saved HoleUV'
        record['_WEB_METRIC'] = {'sorted_sha256': sorted_sha(data), **unique_sha(data)}
        position = src.data.attributes.get('PerforationSurfacePositionR9')
        if part.startswith('corner'):
            assert position is not None, name + ' missing PerforationSurfacePositionR9'
            r9_source = values(position.data, 'vector', 3)
            co = values(src.data.vertices, 'co', 3)
            assert np.array_equal(r9_source, co), name + ' R9 attribute is not the saved outer skin position'
            attr = src.data.attributes.new('_WEB_SURFACE_POSITION', 'FLOAT_VECTOR', 'POINT')
            attr.data.foreach_set('vector', r9_source.ravel())
            record['_WEB_SURFACE_POSITION'] = {
                'source': 'PerforationSurfacePositionR9 (saved outer skin co)',
                'equals_source_vertex_co': True,
                'sorted_sha256': sorted_sha(r9_source), **unique_sha(r9_source),
                'min_m': f32(r9_source).min(axis=0).tolist(), 'max_m': f32(r9_source).max(axis=0).tolist(),
                'sorted_sha256_yup_f32': sorted_sha(yup(r9_source)),
                'unique_sha256_yup_f32': unique_sha(yup(r9_source))['sha256'],
                'first3': f32(r9_source)[:3].tolist()}
    else:
        record['_WEB_METRIC'] = None
    # Optional label is exported even when hidden in the saved Blender render.
    src.hide_set(False); src.hide_viewport = False
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(src.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
    if not len(mesh.polygons):
        bpy.data.meshes.remove(mesh)
        skipped.append(name)
        continue  # revision6's empty legacy arc curves, already part of the continuous rim
    formed = values(mesh.vertices, 'co', 3)
    flat = None
    if is_surface and src.data.shape_keys:
        key = src.data.shape_keys.key_blocks.get('Cut_pattern')
        if key:
            old = key.value; key.value = 1
            bpy.context.view_layer.update(); deps = bpy.context.evaluated_depsgraph_get()
            flat_mesh = bpy.data.meshes.new_from_object(src.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
            assert len(flat_mesh.vertices) == len(mesh.vertices), name + ' flat topology changed'
            flat = values(flat_mesh.vertices, 'co', 3)
            bpy.data.meshes.remove(flat_mesh); key.value = old; bpy.context.view_layer.update()
    record['vertices'] = len(mesh.vertices)
    record['triangles'] = len(mesh.loop_triangles) if mesh.loop_triangles else None
    mesh.calc_loop_triangles()
    record['triangles'] = len(mesh.loop_triangles)
    record['uv'] = [u.name for u in mesh.uv_layers]
    record['cut_pattern'] = flat is not None
    record['formed_sha256'] = hashlib.sha256(f32(formed).tobytes()).hexdigest()
    record['position_sorted_sha256'] = sorted_sha(formed)
    record['position_sorted_sha256_yup_f32'] = sorted_sha(yup(formed))
    normals = np.array([n.vector[:] for n in mesh.corner_normals], dtype=np.float32)
    flatness = np.abs(np.linalg.norm(normals.astype(np.float64), axis=1) - 1).max()
    record['normals'] = {'corners': len(normals), 'max_unit_error': float(flatness),
                         'unique': unique_sha(normals, 6),
                         'unique_yup': unique_sha(yup(normals), 6)}
    if is_surface:
        ev = mesh.attributes.get('_WEB_SURFACE_POSITION')
        if ev is not None:
            ev_values = values(ev.data, 'vector', 3)
            source_set = {tuple(v) for v in np.unique(f32(r9_source), axis=0).tolist()}
            ev_unique = np.unique(f32(ev_values), axis=0)
            record['_WEB_SURFACE_POSITION']['evaluated_vertices'] = int(len(ev_values))
            record['_WEB_SURFACE_POSITION']['evaluated_unique'] = int(len(ev_unique))
            record['_WEB_SURFACE_POSITION']['evaluated_values_are_source_outer_positions'] = bool(
                all(tuple(v) in source_set for v in ev_unique.tolist()))
            record['_WEB_SURFACE_POSITION']['evaluated_sorted_sha256'] = sorted_sha(ev_values)
            record['_WEB_SURFACE_POSITION']['evaluated_unique_sha256'] = unique_sha(ev_values)['sha256']
            delta = np.linalg.norm(f32(ev_values).astype(np.float64) - f32(formed).astype(np.float64), axis=1)
            solid = next((m.thickness for m in src.modifiers if m.type == 'SOLIDIFY'), 0.0)
            record['_WEB_SURFACE_POSITION']['evaluated_on_outer_shell'] = int((delta < 1e-9).sum())
            record['_WEB_SURFACE_POSITION']['evaluated_thickness_band'] = int(
                ((delta > solid * .5) & (delta < solid * 1.5)).sum())
            record['_WEB_SURFACE_POSITION']['evaluated_other'] = int(
                ((delta >= 1e-9) & ~((delta > solid * .5) & (delta < solid * 1.5))).sum())
        if part.startswith('corner'):
            image = bpy.data.images.get('R9_%s_fixed_centers' % part)
            assert image is not None, 'missing packed center image for ' + part
            assert image.is_float and image.colorspace_settings.name == 'Non-Color', part + ' atlas is not a Non-Color float image'
            grid = grid_bounds(src.data.uv_layers['HoleUV'])
            assert list(image.size) == [grid['nx'], grid['ny']], \
                f'{part} atlas size {list(image.size)} != derived grid {[grid["nx"], grid["ny"]]}'
            pixels = np.empty(len(image.pixels), np.float32)
            image.pixels.foreach_get(pixels)
            pixels = pixels.reshape(grid['ny'], grid['nx'], 4)
            alpha = pixels[:, :, 3]
            assert np.isin(np.unique(alpha), [0.0, 1.0]).all(), part + ' alpha is not 0/1'
            assert (pixels[:, :, :3][alpha == 0] == 0).all(), part + ' invalid pixels are not black'
            blob = f32(pixels).tobytes()
            path = OUT / (part + '-hole-centers.rgba32f.bin')
            path.write_bytes(blob)
            group = next((n.node_tree for n in src.data.materials[0].node_tree.nodes
                          if n.type == 'GROUP' and n.node_tree and n.node_tree.name.startswith('R9_')), None)
            assert group is not None, part + ' has no R9 fixed-center node group'
            taps = [n for n in group.nodes if n.type == 'TEX_IMAGE']
            assert len(taps) == 9, part + ' R9 group does not read nine candidates'
            assert all(n.interpolation == 'Closest' and n.extension == 'CLIP' for n in taps), part + ' R9 taps must be Closest+CLIP'
            assert all(n.image is image for n in taps), part + ' R9 taps read a different image'
            assert float(group['diameter_mm']) == .86
            # Cross-check the saved pixels against the double precision JSON audit (samples only).
            centers = centers_audit['objects'][name]['centers']
            inside = [c for c in centers if c['inside']]
            stride = max(1, len(inside)//200)
            worst = 0.0
            for c in inside[::stride]:
                r, col = c['row_j'] - grid['jmin'], c['tile_i'] - grid['imin']
                assert 0 <= r < grid['ny'] and 0 <= col < grid['nx'], 'center outside atlas'
                assert pixels[r, col, 3] == 1.0, part + ' audit center pixel is invalid'
                d = float(np.linalg.norm(f32(pixels[r, col, :3]).astype(np.float64) - np.array(c['position_m'])))
                worst = max(worst, d * 1000.0)
            valid = int((alpha == 1).sum())
            assert valid == len(centers), f'{part} valid pixels {valid} != audited centers {len(centers)}'
            report['atlases'][part] = {
                'image': image.name, 'file': path.name, 'bytes': len(blob),
                'sha256': hashlib.sha256(blob).hexdigest(),
                'width': grid['nx'], 'height': grid['ny'], 'imin': grid['imin'], 'jmin': grid['jmin'],
                'imax': grid['imax'], 'jmax': grid['jmax'],
                'holeuv_min': grid['holeuv_min'], 'holeuv_max': grid['holeuv_max'],
                'valid_pixels': valid, 'invalid_pixels': int(grid['nx'] * grid['ny'] - valid),
                'audited_centers_json': len(centers), 'audited_inside_json': len(inside),
                'sampled_max_pixel_vs_json_mm': worst, 'json_compare_step': stride,
                'source_exr_sha256': hashlib.sha256((REV9/'material_assets'/(name + '_hole_centers.exr')).read_bytes()).hexdigest(),
                'exr_packed_bytes': image.packed_file.size if image.packed_file else 0,
                'node_group': group.name}
            if part == 'corner0':
                report['atlases'][part]['node_group_graph'] = group_dump(group)
    src.name = '__source__' + name
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = src.matrix_world.copy()
    obj['part'] = part; obj['role'] = role; obj['sourceName'] = name; obj['revision'] = 9
    obj['uvUsage'] = 'TEXCOORD_0=ArtworkUV; TEXCOORD_1=GrainUV (40mm); TEXCOORD_2=HoleUV'
    obj['perforation'] = ('R9 fixed-center atlas + _WEB_SURFACE_POSITION' if part.startswith('corner')
                          else 'legacy _WEB_METRIC tangent metric')
    if flat is not None:
        obj.shape_key_add(name='Formed')
        flat_key = obj.shape_key_add(name='Cut_pattern')
        flat_key.data.foreach_set('co', flat.ravel())
        flat_key.value = 0.0
    records_extra = record.pop('formed_sha256', None)
    report['objects'].append(record)
    if records_extra:
        record['formed_sha256'] = records_extra
    exported.append(obj)
    print('Prepared', name, record['triangles'], 'triangles', flush=True)

# Runtime supplies editable materials. Named minimal materials keep inside suede
# separate without embedding duplicate textures or flattening customization.
for material in bpy.data.materials:
    material.use_nodes = True
    nodes = material.node_tree.nodes; nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled'); output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
bpy.ops.object.select_all(action='DESELECT')
for obj in exported:
    obj.select_set(True)
bpy.context.view_layer.objects.active = exported[0]
asset = OUT/'tissuebox-r9.glb'
bpy.ops.export_scene.gltf(filepath=str(asset), export_format='GLB',
    use_selection=True, use_visible=False, use_renderable=False, export_materials='EXPORT',
    export_texcoords=True, export_normals=True, export_attributes=True, export_extras=True,
    export_apply=False, export_morph=True, export_morph_normal=True, export_animations=False,
    export_cameras=False, export_lights=False, export_yup=True, export_shared_accessors=True)

assert before == {str(p): digest(p) for p in protected}, 'Protected file changed'
assert len(report['atlases']) == 4, 'expected one fixed-center atlas per corner'
assert len(report['objects']) + len(skipped) == len(originals), 'object accounting changed'
# Preserve every previous meshIdentity role/part: compare against the shipped r7 GLB.
r7_bytes = (SITE/'public/models/revision7/tissuebox-r7.glb').read_bytes()
r7_json = json.loads(r7_bytes[20:20 + int.from_bytes(r7_bytes[12:16], 'little')])
baseline = sorted((n['name'], n['extras']['part'], n['extras']['role']) for n in r7_json['nodes'])
current = sorted((o['name'], o['part'], o['role']) for o in report['objects'])
assert current == baseline, 'part/role map differs from revision7: ' + str(set(map(tuple, baseline)) ^ set(map(tuple, current)))
report['skipped_empty_objects'] = sorted(skipped)
report['mesh_identity_map_matches_revision7'] = True
report['mesh_identity_map'] = [list(t) for t in current]
report['object_count'] = len(report['objects'])
report['asset_bytes'] = asset.stat().st_size
report['asset_sha256'] = digest(asset)
report['protected_files'] = before
report['protected_files_unchanged'] = True
(CHECKS/'export-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
(OUT/'fixed-centers.json').write_text(json.dumps({
    'kind': 'revision9-fixed-hole-centers', 'revision': 9,
    'encoding': {'dtype': 'float32', 'endian': 'little', 'channels': 4, 'layout': 'RGBA',
                 'rgb': 'hole center xyz in Blender object meters',
                 'alpha': '1 valid, 0 invalid; invalid pixels are black',
                 'row_order': 'Blender image row 0 = jmin (texture v = 0), sample with flipY=false',
                 'component_order': 'row major, one float32 per channel, row 0 first'},
    'filtering': {'min': 'nearest', 'mag': 'nearest', 'mipmaps': False, 'colorSpace': 'none'},
    'grid': {'u_from': 'imin + 0.5 + column', 'v_from': 'jmin + 0.5 + row',
             'uv': 'center of hole (i,j) is (i + 0.25 + 0.5*(j mod 2), 0.25 + 0.5*j)'},
    'diameterMm': .86, 'surfacePositionAttribute': '_WEB_SURFACE_POSITION',
    'sourceBlendSha256': SOURCE_SHA256, 'parts': {k: v for k, v in report['atlases'].items()},
}, ensure_ascii=False, indent=2), encoding='utf8')
(OUT/'manifest.json').write_text(json.dumps({
    'revision': 9, 'asset': 'tissuebox-r9.glb', 'asset_bytes': report['asset_bytes'],
    'asset_sha256': report['asset_sha256'], 'source_sha256': SOURCE_SHA256,
    'fixed_centers': 'fixed-centers.json',
    'perforation': report['perforation'], 'objects': len(report['objects']),
}, ensure_ascii=False, indent=2), encoding='utf8')
print('Export complete', report['asset_bytes'], 'bytes', flush=True)
