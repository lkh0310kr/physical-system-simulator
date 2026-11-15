"""STEP → GLB 변환기 (개발용 일회성 도구, 저장소 의존성 아님).

  python -m venv .venv && .venv/bin/pip install cadquery
  .venv/bin/python tools/step-to-glb.py <in.step> <out.glb> --center X,Y,Z [--deflection 0.05]

STEP(단위 mm, Y가 두께)를 PhysiSim body 좌표계(미터, z가 위, 중심 원점)로 옮겨 쓴다:
  기본 --map X,-Z,Y: x = X-cx, y = -(Z-cz), z = Y-cy.   색은 STEP의 면/부품 색을 그대로 쓴다.
"""
import argparse, json, struct
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFApp import XCAFApp_Application
from OCP.TCollection import TCollection_ExtendedString
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.XCAFDoc import XCAFDoc_ColorTool, XCAFDoc_DocumentTool, XCAFDoc_ShapeTool, XCAFDoc_ColorSurf, XCAFDoc_ColorGen
from OCP.TDF import TDF_LabelSequence, TDF_Label
from OCP.TopLoc import TopLoc_Location
from OCP.Quantity import Quantity_Color
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopoDS import TopoDS

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst")
ap.add_argument("--center", required=True)
ap.add_argument("--deflection", type=float, default=0.05)
ap.add_argument("--map", default="X,-Z,Y", help="PhysiSim x,y,z를 STEP 축으로: 기본 X,-Z,Y (Y가 두께인 STEP). z가 두께인 STEP은 X,Y,Z 등")
a = ap.parse_args()
cx, cy, cz = map(float, a.center.split(","))
C = {"X": cx, "Y": cy, "Z": cz}
AXES = []
for tok in a.map.split(","):
    sign = -1 if tok.startswith("-") else 1
    AXES.append((sign, tok.lstrip("-")))

app = XCAFApp_Application.GetApplication_s()
doc = TDocStd_Document(TCollection_ExtendedString("d")); app.InitDocument(doc)
r = STEPCAFControl_Reader(); r.SetColorMode(True); r.ReadFile(a.src); r.Transfer(doc)
shapes = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
colors = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())

def color_of(shape, label=None):
    c = Quantity_Color()
    for kind in (XCAFDoc_ColorSurf, XCAFDoc_ColorGen):
        if colors.GetColor(shape, kind, c): return c
    if label is not None and XCAFDoc_ColorTool.GetColor_s(label, c): return c
    return None

leaves = []
def walk(l, loc):
    if XCAFDoc_ShapeTool.IsAssembly_s(l):
        cs = TDF_LabelSequence(); XCAFDoc_ShapeTool.GetComponents_s(l, cs)
        for k in range(1, cs.Length() + 1): walk(cs.Value(k), loc)
    elif XCAFDoc_ShapeTool.IsReference_s(l):
        ref = TDF_Label(); XCAFDoc_ShapeTool.GetReferredShape_s(l, ref)
        walk(ref, loc.Multiplied(XCAFDoc_ShapeTool.GetLocation_s(l)))
    else:
        leaves.append((l, XCAFDoc_ShapeTool.GetShape_s(l).Located(loc)))
free = TDF_LabelSequence(); shapes.GetFreeShapes(free)
for i in range(1, free.Length() + 1): walk(free.Value(i), TopLoc_Location())

groups = {}  # (r,g,b,metal) -> (positions, indices)
def add(key, tri_pts, tri_idx):
    pos, idx = groups.setdefault(key, ([], []))
    base = len(pos) // 3
    pos.extend(tri_pts); idx.extend(i + base for i in tri_idx)

for label, shape in leaves:
    BRepMesh_IncrementalMesh(shape, a.deflection, False, 0.5, True)
    leaf_color = color_of(shape, label)
    e = TopExp_Explorer(shape, TopAbs_FACE)
    while e.More():
        face = TopoDS.Face_s(e.Current()); e.Next()
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        if tri is None: continue
        c = color_of(face) or leaf_color
        rgb = (c.Red(), c.Green(), c.Blue()) if c else (0.6, 0.6, 0.6)
        key = tuple(round(v, 2) for v in rgb)
        trsf = loc.Transformation()
        pts = []
        for n in range(1, tri.NbNodes() + 1):
            p = tri.Node(n).Transformed(trsf)
            X, Y, Z = p.X(), p.Y(), p.Z()
            v = {"X": X, "Y": Y, "Z": Z}
            pts += [sg * (v[ax] - C[ax]) / 1000 for sg, ax in AXES]
        idx = []
        flip = face.Orientation() == TopAbs_REVERSED
        for t in range(1, tri.NbTriangles() + 1):
            i1, i2, i3 = tri.Triangle(t).Get()
            tri_ids = [i1 - 1, i3 - 1, i2 - 1] if flip else [i1 - 1, i2 - 1, i3 - 1]
            idx += tri_ids
        add(key, pts, idx)

# 법선: 면 단위 평탄 법선을 쓰면 정점이 늘어나므로 뷰어가 computeVertexNormals 하도록 두고, 여기서는 위치·인덱스·재질만 쓴다.
bin_parts, views, accessors, meshes, materials, nodes = [], [], [], [], [], []
offset = 0
def push(data):
    global offset
    pad = (-len(data)) % 4
    bin_parts.append(data + b"\0" * pad)
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
    offset += len(data) + pad
    return len(views) - 1

for gi, ((r_, g_, b_), (pos, idx)) in enumerate(groups.items()):
    pv = push(struct.pack(f"<{len(pos)}f", *pos))
    iv = push(struct.pack(f"<{len(idx)}I", *idx))
    xs, ys, zs = pos[0::3], pos[1::3], pos[2::3]
    accessors.append({"bufferView": pv, "componentType": 5126, "count": len(pos) // 3, "type": "VEC3",
                      "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]})
    accessors.append({"bufferView": iv, "componentType": 5125, "count": len(idx), "type": "SCALAR"})
    # 밝은 무채색은 금속(커넥터·실드)으로 본다 — STEP에 PBR 값이 없으므로 렌더 추정.
    metal = 0.9 if (abs(r_ - g_) < 0.06 and abs(g_ - b_) < 0.06 and r_ > 0.55) else 0.0
    materials.append({"pbrMetallicRoughness": {"baseColorFactor": [r_, g_, b_, 1], "metallicFactor": metal,
                                               "roughnessFactor": 0.3 if metal else 0.6}, "doubleSided": True})
    meshes.append({"primitives": [{"attributes": {"POSITION": len(accessors) - 2}, "indices": len(accessors) - 1, "material": gi}]})
    nodes.append({"mesh": gi})

gltf = {"asset": {"version": "2.0", "generator": "physisim tools/step-to-glb.py",
                  "extras": {"frame": "PhysiSim body frame: metres, +z up, origin at body centre"}},
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes,
        "materials": materials, "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": offset}]}
js = json.dumps(gltf, separators=(",", ":")).encode(); js += b" " * ((-len(js)) % 4)
binary = b"".join(bin_parts)
total = 12 + 8 + len(js) + 8 + len(binary)
with open(a.dst, "wb") as f:
    f.write(struct.pack("<4sII", b"glTF", 2, total))
    f.write(struct.pack("<I4s", len(js), b"JSON")); f.write(js)
    f.write(struct.pack("<I4s", len(binary), b"BIN\0")); f.write(binary)
print(a.dst, total, "bytes;", len(groups), "materials;", sum(len(g[1]) for g in groups.values()) // 3, "triangles")
