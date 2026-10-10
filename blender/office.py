"""
Builds the props of the hub's virtual office and writes them to
src/features/office/office.glb.

Everything is made here, from code, like blender/character.py, so the props
can be changed in review and rebuilt the same way every time. The look is
Overcooked's: chunky shapes with soft bevels, thick tabletops and saturated
colors, on a floating island.

Each prop is an object named for what it is ("Desk", "OfficeChair"...),
built around the middle of the tiles it takes, standing on the floor at z = 0
and facing -Y; the app places and turns it by the map in
convex/shared/office.ts, where a tile is 1 unit. Wall pieces fill a tile and
face into the room. The island is built where it goes: under the whole office,
WIDTH by HEIGHT tiles, around the origin.

Every seat's top is SEAT high, as blender/character.py sits its character.
Materials are named for what they are; the app lights "Screen", "Glass" and
"Shade" up at night, and dims a desk's "Screen" when nobody's at it.

Run with Blender 5.2 or later, and Node on the PATH to compress the result:

  blender --background --factory-startup --python blender/office.py

Blender is Z up, and props face -Y. The glTF exporter turns that into Y up,
facing +Z, which is three.js's front and the camera's way.
"""

import math
import random
import shutil
import subprocess
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "src" / "features" / "office" / "office.glb"
GLTF_TRANSFORM = "@gltf-transform/cli@4.5.1"

# The map's size in tiles: WIDTH and HEIGHT in convex/shared/office.ts.
WIDTH, HEIGHT = 22, 16
# The top of every seat, where blender/character.py sits its character.
SEAT = 0.19
# How tall walls stand: those around the room, and the low ones inside it.
WALL = 1.1
LOW_WALL = 0.5
# The top of desks and tables, at the hands of someone sitting at them.
DESK = 0.42

# Each material's color, and how rough it is.
MATERIALS = {
    "Arcade": ("#5b3fd1", 0.5),
    "ArcadeAccent": ("#f2c94c", 0.5),
    "Ball": ("#fbf7f0", 0.4),
    "Book1": ("#e5484d", 0.7),
    "Book2": ("#4f9ee8", 0.7),
    "Book3": ("#f2c94c", 0.7),
    "Book4": ("#4cc38a", 0.7),
    "Book5": ("#8e7cf0", 0.7),
    "Bulb": ("#fff6d8", 0.3),
    "Button1": ("#e5484d", 0.35),
    "Button2": ("#f2c94c", 0.35),
    "Button3": ("#4fd1e8", 0.35),
    "ChairSeat": ("#3d5a80", 0.75),
    "Cloud": ("#ffffff", 0.95),
    "Counter": ("#f4efe6", 0.6),
    "Door": ("#b8744a", 0.6),
    "Earth": ("#a8693f", 0.95),
    "EarthDark": ("#7d4a2b", 0.95),
    "Floor": ("#ffffff", 0.7),
    "Frame": ("#fbf7f0", 0.5),
    "Glass": ("#a9dcf5", 0.15),
    "Gold": ("#f2c14e", 0.35),
    "Grass": ("#7cc464", 0.9),
    "GrassDark": ("#5aa64a", 0.9),
    "Leaf": ("#4cb06a", 0.7),
    "LeafDark": ("#2f8a52", 0.7),
    "Machine": ("#e5484d", 0.4),
    "Marquee": ("#ffd166", 0.4),
    "Metal": ("#5d6370", 0.4),
    "Mug": ("#fbf7f0", 0.4),
    "Net": ("#f4f1ea", 0.8),
    "Paddle": ("#e5484d", 0.6),
    "Paper": ("#ffffff", 0.9),
    "PingPong": ("#2f8f6a", 0.6),
    "Plastic": ("#2b2e38", 0.45),
    "PlasticLight": ("#e8e6e1", 0.5),
    "Rock": ("#9aa0a8", 0.9),
    "Rug": ("#7b6cd9", 0.95),
    "RugBorder": ("#f4f1ea", 0.95),
    "Screen": ("#20283a", 0.25),
    "Shade": ("#fff1d0", 0.8),
    "Sofa": ("#e07a5f", 0.85),
    "SofaCushion": ("#ee9a80", 0.85),
    "Armchair": ("#e9b949", 0.85),
    "ArmchairCushion": ("#f4d37a", 0.85),
    "Soil": ("#5a3a26", 0.95),
    "Sticky1": ("#ffe066", 0.8),
    "Sticky2": ("#ff9fbf", 0.8),
    "Terracotta": ("#d9734e", 0.8),
    "TrunkWood": ("#8a5a35", 0.9),
    "Wall": ("#f3e6d3", 0.9),
    "WallCap": ("#c98b52", 0.7),
    "WallTrim": ("#d9c4a7", 0.8),
    "Whiteboard": ("#ffffff", 0.3),
    "Wood": ("#c98b52", 0.65),
    "WoodDark": ("#8a5a35", 0.7),
    "WoodLight": ("#ddb07a", 0.65),
}

# Marker colors on the whiteboard.
INKS = ("Book1", "Book2", "Book4")


# --- Math ---------------------------------------------------------------------


def lerp(a, b, t):
    return a + (b - a) * t


def hex_to_linear(value):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    value = value.lstrip("#")
    return tuple(channel(int(value[i : i + 2], 16)) for i in (0, 2, 4)) + (1.0,)


def squircle(t, power=6):
    """A rounded rectangle's outline at angle t, from -1 to 1 each way."""
    c, s = math.cos(t), math.sin(t)
    return (
        math.copysign(abs(c) ** (2 / power), c),
        math.copysign(abs(s) ** (2 / power), s),
    )


def wobble(t, seed, amount):
    """A smooth, repeatable bump around a loop, to make edges look made by hand."""
    rng = random.Random(seed)
    terms = [(k, rng.uniform(0, 2 * math.pi), rng.uniform(0.4, 1.0)) for k in (2, 3, 5, 7)]
    total = sum(weight for _, _, weight in terms)
    return amount * sum(weight * math.sin(k * t + phase) for k, phase, weight in terms) / total


# --- Materials ----------------------------------------------------------------


def material(name):
    found = bpy.data.materials.get(name)
    if found:
        return found
    color, roughness = MATERIALS[name]
    made = bpy.data.materials.new(name)
    made.diffuse_color = hex_to_linear(color)
    if made.node_tree is None:
        made.use_nodes = True
    bsdf = made.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_to_linear(color)
    bsdf.inputs["Roughness"].default_value = roughness
    return made


# --- Meshes -------------------------------------------------------------------


class Part:
    """One object's mesh, put together from shapes."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []

    def _add(self, mat, build, matrix):
        """Builds a shape at the origin, then moves it into place and paints it."""
        before = set(self.bm.faces)
        build(self.bm)
        made = [face for face in self.bm.faces if face not in before]
        for vert in {vert for face in made for vert in face.verts}:
            vert.co = matrix @ vert.co
        if mat not in self.materials:
            self.materials.append(mat)
        index = self.materials.index(mat)
        for face in made:
            face.material_index = index
            face.smooth = True
        return made

    def box(self, center, size, mat, r=0.03, seg=2, rot=(0, 0, 0), vertical=False):
        """
        A box with its edges rounded off by r, or only its upright ones, for a
        slab with round corners. `rot` turns it in degrees around its middle.
        """

        def build(bm):
            verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
            for vert in verts:
                vert.co = Vector((vert.co.x * size[0], vert.co.y * size[1], vert.co.z * size[2]))
            if r <= 0:
                return
            edges = {edge for vert in verts for edge in vert.link_edges}
            if vertical:
                edges = {
                    edge
                    for edge in edges
                    if abs((edge.verts[0].co - edge.verts[1].co).normalized().z) > 0.9
                }
            limit = (min(size[:2]) if vertical else min(size)) / 2 * 0.98
            bmesh.ops.bevel(
                bm,
                geom=list(edges),
                offset=min(r, limit),
                segments=seg,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )

        turn = Euler(tuple(math.radians(a) for a in rot), "XYZ").to_matrix().to_4x4()
        return self._add(mat, build, Matrix.Translation(Vector(center)) @ turn)

    def cylinder(self, center, radius, height, mat, top=None, segs=16, r=0.0, rot=(0, 0, 0)):
        """An upright cylinder, or a cone cut short with `top`, its rims rounded by r."""

        def build(bm):
            verts = bmesh.ops.create_cone(
                bm,
                cap_ends=True,
                cap_tris=False,
                segments=segs,
                radius1=radius,
                radius2=radius if top is None else top,
                depth=height,
            )["verts"]
            if r <= 0:
                return
            faces = {face for vert in verts for face in vert.link_faces}
            for face in faces:
                face.normal_update()
            rims = [
                edge
                for edge in {edge for vert in verts for edge in vert.link_edges}
                if len(edge.link_faces) == 2
                and edge.link_faces[0].normal.dot(edge.link_faces[1].normal) < 0.5
            ]
            bmesh.ops.bevel(
                bm,
                geom=rims,
                offset=min(r, height / 2 * 0.95),
                segments=2,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )

        turn = Euler(tuple(math.radians(a) for a in rot), "XYZ").to_matrix().to_4x4()
        return self._add(mat, build, Matrix.Translation(Vector(center)) @ turn)

    def sphere(self, center, radii, mat, seg=16, rings=10):
        def build(bm):
            for vert in bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)["verts"]:
                vert.co = Vector((vert.co.x * radii[0], vert.co.y * radii[1], vert.co.z * radii[2]))

        return self._add(mat, build, Matrix.Translation(Vector(center)))

    def rock(self, center, size, mat, seed, flat=0.7):
        """A lumpy stone, flattened a little."""
        rng = random.Random(seed)

        def build(bm):
            for vert in bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)["verts"]:
                k = rng.uniform(0.82, 1.12)
                vert.co = Vector((vert.co.x * size * k, vert.co.y * size * k, vert.co.z * size * k * flat))

        made = self._add(mat, build, Matrix.Translation(Vector(center)))
        for face in made:
            face.smooth = False
        return made

    def finish(self, sharp=32, **extras):
        """Makes the object, with edges sharper than `sharp` degrees kept crisp."""
        self.bm.normal_update()
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for name in self.materials:
            mesh.materials.append(material(name))
        mesh.set_sharp_from_angle(angle=math.radians(sharp))
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for key, value in extras.items():
            obj[key] = value
        return obj


# --- Floor and walls ----------------------------------------------------------


def build_floor_tile():
    """One tile of floor, its top at 0; the app checkers them by room."""
    part = Part("FloorTile")
    part.box((0, 0, -0.05), (1.0, 1.0, 0.1), "Floor", r=0.03, seg=1)
    return part.finish()


def wall_block(part, height):
    """A block filling its tile, from under the floor up, with a skirting board in front."""
    part.box((0, 0, (height - 0.1) / 2), (1.0, 1.0, height + 0.1), "Wall", r=0.025, seg=1)
    part.box((0, -0.5, 0.06), (1.0, 0.05, 0.12), "WallTrim", r=0.01, seg=1)
    part.box((0, 0, height), (1.0, 1.0, 0.05), "WallTrim", r=0.015, seg=1)


def build_wall():
    part = Part("Wall")
    wall_block(part, WALL)
    return part.finish()


def build_window():
    """A wall with a window in its face, sky blue by day and lit up at night."""
    part = Part("WallWindow")
    wall_block(part, WALL)
    z, w, h = 0.66, 0.62, 0.5
    part.box((0, -0.5, z), (w - 0.06, 0.03, h - 0.06), "Glass", r=0.0)
    for x in (-w / 2, w / 2):
        part.box((x, -0.52, z), (0.06, 0.06, h + 0.04), "Frame", r=0.015, seg=1)
    for dz in (-h / 2, h / 2):
        part.box((0, -0.52, z + dz), (w + 0.06, 0.06, 0.06), "Frame", r=0.015, seg=1)
    part.box((0, -0.515, z), (0.035, 0.035, h), "Frame", r=0.0)
    part.box((0, -0.515, z), (w, 0.035, 0.035), "Frame", r=0.0)
    part.box((0, -0.56, z - h / 2 - 0.04), (w + 0.14, 0.12, 0.05), "Frame", r=0.015, seg=1)
    return part.finish()


def build_door():
    part = Part("WallDoor")
    wall_block(part, WALL)
    part.box((0, -0.51, 0.44), (0.6, 0.05, 0.88), "Door", r=0.02, seg=2)
    for x in (-0.33, 0.33):
        part.box((x, -0.525, 0.46), (0.06, 0.06, 0.94), "Frame", r=0.015, seg=1)
    part.box((0, -0.525, 0.93), (0.72, 0.06, 0.06), "Frame", r=0.015, seg=1)
    part.box((0, -0.54, 0.62), (0.4, 0.02, 0.22), "WoodDark", r=0.01, seg=1)
    part.box((0, -0.54, 0.26), (0.4, 0.02, 0.26), "WoodDark", r=0.01, seg=1)
    part.sphere((0.22, -0.56, 0.44), (0.035, 0.035, 0.035), "Gold", seg=10, rings=6)
    return part.finish()


def build_low_wall():
    """A low wall between rooms, a counter to see over, with a wooden top."""
    part = Part("WallLow")
    part.box((0, 0, (LOW_WALL - 0.1) / 2), (1.0, 1.0, LOW_WALL + 0.1), "Wall", r=0.025, seg=1)
    part.box((0, 0, LOW_WALL + 0.03), (1.0, 1.0, 0.07), "WallCap", r=0.025, seg=2)
    return part.finish()


# --- Desks and chairs ---------------------------------------------------------


def build_desk():
    """A desk, its front to whoever sits at it; the monitor is its own prop."""
    part = Part("Desk")
    part.box((0, -0.04, DESK - 0.04), (0.94, 0.8, 0.08), "Wood", r=0.03)
    part.box((-0.31, 0.02, (DESK - 0.08) / 2), (0.26, 0.66, DESK - 0.08), "WoodDark", r=0.02)
    part.box((0.41, 0.02, (DESK - 0.08) / 2), (0.07, 0.66, DESK - 0.08), "WoodDark", r=0.02)
    part.box((0.05, 0.3, 0.23), (0.7, 0.04, 0.22), "WoodDark", r=0.015)
    for z in (0.09, 0.22):
        part.box((-0.31, -0.32, z), (0.22, 0.03, 0.1), "Wood", r=0.012, seg=1)
        part.box((-0.31, -0.34, z + 0.01), (0.08, 0.02, 0.02), "Metal", r=0.006, seg=1)
    # Keyboard and mouse, near the front.
    part.box((0.02, -0.25, DESK + 0.012), (0.42, 0.14, 0.025), "PlasticLight", r=0.01, seg=1)
    for row in range(3):
        part.box((0.02, -0.29 + row * 0.04, DESK + 0.027), (0.38, 0.026, 0.008), "Metal", r=0.0)
    part.sphere((0.3, -0.24, DESK + 0.012), (0.035, 0.05, 0.02), "PlasticLight", seg=12, rings=6)
    # A mug.
    part.cylinder((-0.32, -0.18, DESK + 0.05), 0.045, 0.1, "Mug", segs=14, r=0.01)
    part.cylinder((-0.32, -0.18, DESK + 0.098), 0.036, 0.004, "Soil", segs=14)
    return part.finish()


def build_monitor():
    """A monitor where a desk puts it: the app sets the screen on or off."""
    part = Part("Monitor")
    y = 0.2
    part.box((0, y + 0.02, DESK + 0.01), (0.22, 0.14, 0.02), "Plastic", r=0.008, seg=1)
    part.box((0, y + 0.04, DESK + 0.12), (0.05, 0.035, 0.22), "Plastic", r=0.01, seg=1)
    part.box((0, y, DESK + 0.27), (0.58, 0.06, 0.37), "Plastic", r=0.025)
    part.box((0, y - 0.032, DESK + 0.275), (0.52, 0.01, 0.3), "Screen", r=0.0)
    return part.finish()


def build_office_chair():
    """A swivel chair, its seat SEAT high, facing the way its sitter does."""
    part = Part("OfficeChair")
    part.box((0, 0.02, SEAT - 0.035), (0.46, 0.44, 0.07), "ChairSeat", r=0.03)
    part.box((0, 0.25, 0.43), (0.42, 0.07, 0.34), "ChairSeat", r=0.035)
    part.box((0, 0.25, 0.22), (0.07, 0.04, 0.12), "Metal", r=0.01, seg=1)
    part.cylinder((0, 0.02, 0.095), 0.025, 0.1, "Metal", segs=10)
    for k in range(5):
        a = 2 * math.pi * k / 5 + math.pi / 2
        end = Vector((math.cos(a) * 0.2, 0.02 + math.sin(a) * 0.2, 0.03))
        mid = (end + Vector((0, 0.02, 0.045))) / 2
        part.box(mid, (0.21, 0.04, 0.025), "Metal", r=0.008, seg=1, rot=(0, 0, math.degrees(a)))
        part.sphere(end - Vector((0, 0, 0.005)), (0.025, 0.025, 0.025), "Plastic", seg=8, rings=5)
    return part.finish()


# --- Lounge -------------------------------------------------------------------


def build_couch():
    """A couch three tiles wide, a cushion for each seat, on the middle of each tile."""
    part = Part("Couch")
    part.box((0, 0.04, 0.07), (2.9, 0.82, 0.14), "Sofa", r=0.05)
    for x in (-0.97, 0, 0.97):
        part.box((x, -0.02, SEAT - 0.035), (0.92, 0.68, 0.11), "SofaCushion", r=0.045)
        part.box((x, 0.24, 0.37), (0.9, 0.14, 0.32), "SofaCushion", r=0.05)
    part.box((0, 0.38, 0.36), (2.9, 0.2, 0.62), "Sofa", r=0.08)
    for x in (-1.39, 1.39):
        part.box((x, 0.04, 0.22), (0.16, 0.82, 0.42), "Sofa", r=0.06)
    return part.finish()


def build_armchair():
    part = Part("Armchair")
    part.box((0, 0.04, 0.07), (0.82, 0.82, 0.14), "Armchair", r=0.05)
    part.box((0, -0.02, SEAT - 0.035), (0.56, 0.66, 0.11), "ArmchairCushion", r=0.045)
    part.box((0, 0.34, 0.37), (0.82, 0.2, 0.6), "Armchair", r=0.08)
    for x in (-0.35, 0.35):
        part.box((x, 0.04, 0.22), (0.14, 0.82, 0.42), "Armchair", r=0.06)
    return part.finish()


def build_rug():
    """A rug five tiles by three, a border round it."""
    part = Part("Rug")
    part.box((0, 0, 0.006), (4.8, 2.8, 0.012), "RugBorder", r=0.3, vertical=True)
    part.box((0, 0, 0.012), (4.5, 2.5, 0.012), "Rug", r=0.22, vertical=True)
    part.box((0, 0, 0.016), (3.6, 1.6, 0.01), "RugBorder", r=0.16, vertical=True)
    part.box((0, 0, 0.019), (3.4, 1.4, 0.01), "Rug", r=0.14, vertical=True)
    return part.finish()


def build_coffee_table():
    part = Part("CoffeeTable")
    top = 0.27
    part.box((0, 0, top - 0.03), (0.74, 0.64, 0.06), "WoodLight", r=0.025)
    for x in (-0.3, 0.3):
        for y in (-0.25, 0.25):
            part.cylinder((x, y, (top - 0.06) / 2), 0.035, top - 0.06, "WoodDark", segs=10)
    part.cylinder((0.18, -0.08, top + 0.045), 0.045, 0.09, "Mug", segs=14, r=0.01)
    part.box((-0.14, 0.06, top + 0.015), (0.26, 0.2, 0.03), "Book2", r=0.008, seg=1, rot=(0, 0, 12))
    part.box((-0.12, 0.05, top + 0.045), (0.22, 0.17, 0.03), "Book3", r=0.008, seg=1, rot=(0, 0, -6))
    return part.finish()


def build_bookshelf():
    """A bookshelf two tiles wide, its back to the wall, full of books."""
    part = Part("Bookshelf")
    rng = random.Random(3)
    width, depth, height, y = 1.8, 0.42, 1.25, 0.26
    for x in (-width / 2, width / 2):
        part.box((x, y, height / 2), (0.06, depth, height), "Wood", r=0.015, seg=1)
    part.box((0, y + depth / 2 - 0.015, height / 2), (width, 0.03, height), "WoodDark", r=0.0)
    shelves = [0.05, 0.36, 0.67, 0.98, height]
    for z in shelves:
        part.box((0, y, z), (width + 0.04, depth + 0.02, 0.05), "Wood", r=0.015, seg=1)
    for bottom, top in zip(shelves, shelves[1:]):
        x = -width / 2 + 0.06
        while x < width / 2 - 0.12:
            thick = rng.uniform(0.05, 0.09)
            tall = rng.uniform(0.6, 0.85) * (top - bottom - 0.03)
            lean = rng.choice((0, 0, 0, 8))
            book = f"Book{rng.randint(1, 5)}"
            part.box((x + thick / 2, y - 0.02, bottom + 0.025 + tall / 2), (thick, depth - 0.1, tall), book, r=0.008, seg=1, rot=(0, lean, 0))
            x += thick + 0.008 + (0.06 if rng.random() < 0.12 else 0)
    return part.finish()


def build_coffee_machine():
    """A coffee machine on a counter, a cup under its spout."""
    part = Part("CoffeeMachine")
    part.box((0, 0.12, 0.25), (0.86, 0.62, 0.5), "Counter", r=0.03)
    part.box((0, 0.12, 0.52), (0.92, 0.68, 0.05), "Wood", r=0.02)
    for x in (-0.2, 0.2):
        part.box((x, -0.2, 0.25), (0.38, 0.02, 0.4), "Counter", r=0.012, seg=1)
        part.box((x + (0.12 if x < 0 else -0.12), -0.215, 0.38), (0.04, 0.02, 0.1), "Metal", r=0.008, seg=1)
    body = (0.0, 0.2, 0.8)
    part.box(body, (0.4, 0.36, 0.5), "Machine", r=0.06)
    part.box((0, 0.0, 0.94), (0.3, 0.06, 0.12), "Plastic", r=0.02, seg=1)
    part.cylinder((0, -0.04, 0.68), 0.03, 0.08, "Metal", segs=10)
    part.box((0, -0.02, 0.56), (0.26, 0.18, 0.025), "Metal", r=0.008, seg=1)
    part.cylinder((0, -0.04, 0.615), 0.04, 0.08, "Mug", segs=14, r=0.01)
    part.sphere((-0.1, -0.005, 0.94), (0.02, 0.02, 0.02), "Button3", seg=8, rings=5)
    part.sphere((0.1, -0.005, 0.94), (0.02, 0.02, 0.02), "Button2", seg=8, rings=5)
    part.cylinder((0.3, 0.1, 0.63), 0.07, 0.17, "Glass", segs=14, r=0.015)
    part.cylinder((0.3, 0.1, 0.725), 0.075, 0.03, "WoodDark", segs=14, r=0.01)
    return part.finish()


# --- Meeting room -------------------------------------------------------------


def build_meeting_table():
    """A long table four tiles wide, for chairs along both sides."""
    part = Part("MeetingTable")
    part.box((0, 0, DESK - 0.04), (3.9, 0.92, 0.08), "WoodLight", r=0.04)
    for x in (-1.25, 1.25):
        part.box((x, 0, (DESK - 0.08) / 2), (0.22, 0.46, DESK - 0.08), "WoodDark", r=0.02)
        part.box((x, 0, 0.025), (0.34, 0.7, 0.05), "WoodDark", r=0.02, seg=1)
    for x, y, turn in ((-1.0, -0.2, 6), (0.6, 0.18, -10), (1.4, -0.16, 4)):
        part.box((x, y, DESK + 0.004), (0.24, 0.32, 0.008), "Paper", r=0.0, rot=(0, 0, turn))
    part.cylinder((0, 0, DESK + 0.07), 0.07, 0.14, "Terracotta", top=0.085, segs=14, r=0.012)
    for dx, dy, size in ((0, 0, 0.1), (0.05, 0.03, 0.08), (-0.05, -0.02, 0.08)):
        part.sphere((dx, dy, DESK + 0.2), (size, size, size * 0.9), "Leaf", seg=12, rings=8)
    return part.finish()


def build_tv():
    """A TV two tiles wide, hung on the face of the wall."""
    part = Part("Tv")
    part.box((0, -0.53, 0.66), (1.5, 0.06, 0.84), "Plastic", r=0.03)
    part.box((0, -0.562, 0.67), (1.4, 0.01, 0.72), "Screen", r=0.0)
    return part.finish()


def build_whiteboard():
    """A whiteboard two tiles wide on the face of the wall, with a chart on it."""
    part = Part("Whiteboard")
    z = 0.62
    part.box((0, -0.515, z), (1.6, 0.03, 0.8), "Whiteboard", r=0.0)
    for x in (-0.82, 0.82):
        part.box((x, -0.52, z), (0.05, 0.05, 0.86), "Metal", r=0.012, seg=1)
    for dz in (-0.42, 0.42):
        part.box((0, -0.52, z + dz), (1.69, 0.05, 0.05), "Metal", r=0.012, seg=1)
    part.box((0, -0.57, z - 0.45), (1.2, 0.1, 0.03), "Metal", r=0.01, seg=1)
    # A bar chart, a line under it, and notes.
    for i, h in enumerate((0.16, 0.26, 0.2, 0.36)):
        part.box((-0.62 + i * 0.13, -0.532, z - 0.22 + h / 2), (0.08, 0.004, h), INKS[i % 3], r=0.0)
    part.box((-0.43, -0.533, z - 0.225), (0.58, 0.004, 0.012), "Metal", r=0.0)
    for i in range(4):
        x = 0.05 + i * 0.12
        part.box((x, -0.532, z + 0.06 - i * 0.03), (0.13, 0.004, 0.012), "Book2", r=0.0, rot=(0, 18 - i * 12, 0))
    part.box((0.48, -0.533, z + 0.2), (0.16, 0.004, 0.16), "Sticky1", r=0.0, rot=(0, 6, 0))
    part.box((0.66, -0.533, z + 0.16), (0.14, 0.004, 0.14), "Sticky2", r=0.0, rot=(0, -8, 0))
    part.box((0.5, -0.533, z - 0.12), (0.4, 0.004, 0.012), "Book1", r=0.0)
    part.box((0.46, -0.533, z - 0.17), (0.32, 0.004, 0.012), "Book1", r=0.0)
    return part.finish()


# --- Game corner --------------------------------------------------------------


def build_arcade():
    """An arcade cabinet, its screen and marquee lit up."""
    part = Part("Arcade")
    part.box((0, 0.1, 0.66), (0.64, 0.56, 1.32), "Arcade", r=0.04)
    for x in (-0.33, 0.33):
        part.box((x, 0.1, 0.66), (0.03, 0.5, 1.2), "ArcadeAccent", r=0.01, seg=1)
    part.box((0, -0.2, 0.44), (0.6, 0.12, 0.62), "Arcade", r=0.03)
    part.box((0, -0.24, 0.77), (0.66, 0.34, 0.08), "Plastic", r=0.025, rot=(-12, 0, 0))
    part.cylinder((-0.14, -0.27, 0.86), 0.012, 0.1, "Metal", segs=8)
    part.sphere((-0.14, -0.27, 0.92), (0.035, 0.035, 0.035), "Button1", seg=10, rings=6)
    for i, button in enumerate(("Button1", "Button2", "Button3")):
        part.cylinder((0.04 + i * 0.09, -0.25 + (i % 2) * 0.03, 0.82), 0.026, 0.03, button, segs=10, r=0.006)
    part.box((0, -0.12, 1.0), (0.5, 0.04, 0.34), "Plastic", r=0.02, rot=(-14, 0, 0))
    part.box((0, -0.145, 1.0), (0.42, 0.01, 0.27), "Screen", r=0.0, rot=(-14, 0, 0))
    part.box((0, -0.12, 1.26), (0.62, 0.1, 0.14), "Marquee", r=0.02)
    return part.finish()


def build_ping_pong():
    """A ping-pong table three tiles by two, paddles and a ball on it."""
    part = Part("PingPong")
    top = 0.4
    part.box((0, 0, top - 0.025), (2.5, 1.4, 0.05), "PingPong", r=0.015, seg=1)
    for y in (-0.69, 0.69):
        part.box((0, y, top + 0.001), (2.5, 0.025, 0.004), "Net", r=0.0)
    for x in (-1.24, 1.24):
        part.box((x, 0, top + 0.001), (0.025, 1.4, 0.004), "Net", r=0.0)
    part.box((0, 0, top + 0.001), (2.5, 0.015, 0.004), "Net", r=0.0)
    part.box((0, 0, top + 0.07), (0.02, 1.5, 0.12), "Net", r=0.0)
    for y in (-0.76, 0.76):
        part.box((0, y, top + 0.06), (0.04, 0.04, 0.14), "Metal", r=0.01, seg=1)
    for x in (-1.0, 1.0):
        for y in (-0.55, 0.55):
            part.box((x, y, (top - 0.05) / 2), (0.06, 0.06, top - 0.05), "Metal", r=0.015, seg=1)
    for x, turn in ((-0.75, 20), (0.8, -150)):
        part.cylinder((x, 0.3, top + 0.012), 0.09, 0.02, "Paddle", segs=16, r=0.006)
        part.box((x + 0.12 * math.cos(math.radians(turn)), 0.3 + 0.12 * math.sin(math.radians(turn)), top + 0.015), (0.12, 0.035, 0.02), "WoodLight", r=0.008, seg=1, rot=(0, 0, turn))
    part.sphere((0.3, -0.35, top + 0.025), (0.025, 0.025, 0.025), "Ball", seg=10, rings=6)
    return part.finish()


# --- Here and there -----------------------------------------------------------


def build_plant():
    part = Part("Plant")
    part.cylinder((0, 0, 0.17), 0.16, 0.34, "Terracotta", top=0.2, segs=18, r=0.02)
    part.cylinder((0, 0, 0.335), 0.215, 0.05, "Terracotta", segs=18, r=0.015)
    part.cylinder((0, 0, 0.345), 0.18, 0.02, "Soil", segs=18)
    leaves = [
        ((0, 0, 0.72), 0.24, "Leaf"),
        ((0.14, 0.06, 0.58), 0.18, "LeafDark"),
        ((-0.15, -0.04, 0.6), 0.19, "Leaf"),
        ((0.02, -0.15, 0.55), 0.16, "LeafDark"),
        ((-0.04, 0.14, 0.62), 0.17, "LeafDark"),
        ((0.06, 0.02, 0.9), 0.15, "Leaf"),
    ]
    for center, size, leaf in leaves:
        part.sphere(center, (size, size, size * 0.92), leaf, seg=14, rings=9)
    return part.finish()


def build_lamp():
    """A floor lamp, its shade lit at night."""
    part = Part("Lamp")
    part.cylinder((0, 0, 0.025), 0.16, 0.05, "Metal", segs=18, r=0.015)
    part.cylinder((0, 0, 0.56), 0.02, 1.02, "Metal", segs=10)
    part.cylinder((0, 0, 1.12), 0.23, 0.28, "Shade", top=0.15, segs=20, r=0.01)
    part.sphere((0, 0, 1.02), (0.06, 0.06, 0.06), "Bulb", seg=10, rings=6)
    return part.finish()


def build_tree():
    """A round tree, for the island's grass outside."""
    part = Part("Tree")
    part.cylinder((0, 0, 0.3), 0.08, 0.6, "TrunkWood", top=0.06, segs=10, r=0.02)
    for center, size, leaf in (
        ((0, 0, 0.95), 0.42, "Leaf"),
        ((0.22, 0.08, 0.78), 0.28, "LeafDark"),
        ((-0.2, -0.1, 0.8), 0.3, "LeafDark"),
        ((0.05, -0.05, 1.25), 0.26, "Leaf"),
    ):
        part.sphere(center, (size, size, size * 0.9), leaf, seg=14, rings=9)
    return part.finish()


def build_bush():
    part = Part("Bush")
    for center, size, leaf in (
        ((0, 0, 0.16), 0.24, "Leaf"),
        ((0.2, 0.05, 0.12), 0.17, "LeafDark"),
        ((-0.19, -0.04, 0.12), 0.18, "LeafDark"),
    ):
        part.sphere(center, (size, size, size * 0.85), leaf, seg=12, rings=8)
    return part.finish()


def build_rock():
    part = Part("Rock")
    part.rock((0, 0, 0), 0.5, "Rock", seed=5, flat=0.8)
    part.rock((0, 0, 0.32), 0.42, "Grass", seed=9, flat=0.22)
    return part.finish(sharp=180)


def build_cloud():
    """A puffy cloud, flat underneath; the app drifts copies of it by."""
    part = Part("Cloud")
    for center, size in (
        ((0, 0, 0), 0.75),
        ((0.75, 0.1, -0.1), 0.55),
        ((-0.7, -0.05, -0.12), 0.58),
        ((0.3, -0.2, 0.3), 0.5),
        ((-0.25, 0.2, 0.28), 0.48),
    ):
        part.sphere(center, (size, size * 0.85, size * 0.75), "Cloud", seg=14, rings=9)
    return part.finish(sharp=180)


# --- Island -------------------------------------------------------------------


def build_island():
    """
    The floating island the office stands on: grass on top, the office's
    footprint and a rim round it, and earth below, narrowing to a point.
    """
    part = Part("Island")
    bm = part.bm
    half_x, half_y = WIDTH / 2 + 1.35, HEIGHT / 2 + 1.35
    segs = 96
    top = -0.1
    # Each ring: (height, how far out as a share of the top, material of the band above it).
    rings = [
        (top, 1.0, None),
        (top - 0.12, 1.012, "Grass"),
        (top - 0.3, 1.0, "GrassDark"),
        (top - 0.34, 0.985, "GrassDark"),
        (-0.9, 0.99, "Earth"),
        (-1.5, 0.96, "Earth"),
        (-1.62, 0.95, "EarthDark"),
        (-2.4, 0.86, "Earth"),
        (-3.2, 0.7, "Earth"),
        (-3.32, 0.68, "EarthDark"),
        (-4.1, 0.48, "Earth"),
        (-4.9, 0.27, "Earth"),
        (-5.5, 0.1, "EarthDark"),
    ]
    columns = []
    for i in range(segs):
        t = 2 * math.pi * i / segs
        sx, sy = squircle(t, power=8)
        column = []
        for k, (z, scale, _) in enumerate(rings):
            rough = 1 + (wobble(t, k + 1, 0.07) if k >= 3 else 0)
            dz = wobble(t, 40 + k, 0.18) if k >= 4 else 0
            column.append(bm.verts.new((sx * half_x * scale * rough, sy * half_y * scale * rough, z + dz)))
        columns.append(column)
    tip = bm.verts.new((0.6, -0.4, -6.4))
    materials = []

    def paint(face, name):
        if name not in materials:
            materials.append(name)
        face.material_index = materials.index(name)
        face.smooth = True

    cap = bm.faces.new([column[0] for column in columns])
    paint(cap, "Grass")
    for i in range(segs):
        a, b = columns[i], columns[(i + 1) % segs]
        for k in range(1, len(rings)):
            paint(bm.faces.new((a[k - 1], a[k], b[k], b[k - 1])), rings[k][2])
        paint(bm.faces.new((a[-1], tip, b[-1])), "EarthDark")
    part.materials = materials
    island = part.finish(sharp=40)
    return island


# --- Build --------------------------------------------------------------------


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            block.remove(item)


BUILDERS = (
    build_floor_tile,
    build_wall,
    build_window,
    build_door,
    build_low_wall,
    build_desk,
    build_monitor,
    build_office_chair,
    build_couch,
    build_armchair,
    build_rug,
    build_coffee_table,
    build_bookshelf,
    build_coffee_machine,
    build_meeting_table,
    build_tv,
    build_whiteboard,
    build_arcade,
    build_ping_pong,
    build_plant,
    build_lamp,
    build_tree,
    build_bush,
    build_rock,
    build_cloud,
    build_island,
)


def build():
    clear()
    return [builder() for builder in BUILDERS]


def export(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = path.with_suffix(".raw.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(raw),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    # Quantized and meshopt-compressed, like the character.
    npx = shutil.which("npx")
    if npx is None:
        raise SystemExit("Needs Node's npx on the PATH, to compress the model.")
    subprocess.run(
        [npx, "--yes", GLTF_TRANSFORM, "meshopt", str(raw), str(path), "--level", "high"],
        check=True,
    )
    raw.unlink()


def args():
    rest = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    options = {}
    for i, arg in enumerate(rest):
        if arg.startswith("--") and i + 1 < len(rest):
            options[arg[2:]] = rest[i + 1]
    return options


if __name__ == "__main__":
    options = args()
    build()
    export(Path(options.get("out", OUTPUT)))
    if "blend" in options:
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(options["blend"]).resolve()))
    print(f"Wrote {options.get('out', OUTPUT)}")
