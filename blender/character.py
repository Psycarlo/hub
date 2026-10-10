"""
Builds the hub's 3D character and writes it to
src/features/character/character.glb.

Everything is made here, from code, so the model can be changed in review and
rebuilt the same way every time. The look is chibi, after Animal Crossing and
Overcooked: a big round head, a small body, short arms ending in mitten hands,
and stubby legs in round shoes.

Every part is rigid and parented to one bone, so nothing bends and nothing
needs skin weights. Parts that people pick between (hair, hats, glasses, tops)
are all in the file, tagged with glTF extras that the app reads:

  slot     "hair", "hat", "glasses" or "top"
  variant  the option's id, matching convex/shared/character.ts
  hat      on hair only: 1 for the version worn under a hat, cut to fit it

Materials are named for what they color ("Skin", "Hair", "Top"...), and the
app recolors them per person. Animations are actions on the armature, one per
move: idle, walk, run, jump, wave and dance.

Run with Blender 5.2 or later, and Node on the PATH to compress the result:

  blender --background --factory-startup --python blender/character.py
  blender -b --factory-startup -P blender/character.py -- --blend out.blend

The second also saves the scene, to look at it in Blender.

Blender is Z up, and the character faces -Y. The glTF exporter turns that into
Y up, facing +Z, which is three.js's front.
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
OUTPUT = ROOT / "src" / "features" / "character" / "character.glb"
GLTF_TRANSFORM = "@gltf-transform/cli@4.5.1"

FPS = 30

# The head, an ellipsoid everything on it is placed against.
HEAD_CENTER = Vector((0.0, 0.0, 0.86))
HEAD_RADII = Vector((0.31, 0.29, 0.29))

# Colors to look at it by in Blender; the app sets its own.
MATERIALS = {
    "Bottom": "#3d5a80",
    "Cheek": "#ff9f9f",
    "Drawstring": "#f4f1ea",
    "Eye": "#1f1b24",
    "EyeWhite": "#ffffff",
    "Frame": "#2b2b33",
    "Hair": "#5a3825",
    "Hat": "#f4f1ea",
    "Lens": "#20263a",
    "Mouth": "#8a3b3b",
    "Shoes": "#f4f1ea",
    "Skin": "#f2c29b",
    "Sole": "#8e7f74",
    "Top": "#ff7a59",
}

# Bone name: (head, tail, parent). Arms hang a little out, like an A.
BONES = {
    "root": ((0, 0, 0), (0, 0, 0.12), None),
    "hips": ((0, 0, 0.22), (0, 0, 0.32), "root"),
    "spine": ((0, 0, 0.32), (0, 0, 0.56), "hips"),
    "head": ((0, 0, 0.56), (0, 0, 0.9), "spine"),
    "arm_L": ((0.14, 0, 0.51), (0.205, 0, 0.35), "spine"),
    "arm_R": ((-0.14, 0, 0.51), (-0.205, 0, 0.35), "spine"),
    "leg_L": ((0.075, 0, 0.24), (0.075, 0, 0.05), "hips"),
    "leg_R": ((-0.075, 0, 0.24), (-0.075, 0, 0.05), "hips"),
}

# Where hats sit on the head, as heights on the unit head (-1 chin, 1 crown)
# at the front, the sides and the back.
HAT_LINE = (0.45, 0.25, 0.05)


# --- Math ---------------------------------------------------------------------


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def ease(t):
    """Slow in and out, for moving between key poses."""
    return smoothstep(0, 1, t)


def hex_to_linear(value):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    value = value.lstrip("#")
    return tuple(channel(int(value[i : i + 2], 16)) for i in (0, 2, 4)) + (1.0,)


def on_head(x, z, out=0.0):
    """The point on the front of the head at x and z, and the way it faces."""
    u = Vector((x, 0, z)) - HEAD_CENTER
    rest = 1 - (u.x / HEAD_RADII.x) ** 2 - (u.z / HEAD_RADII.z) ** 2
    y = -HEAD_RADII.y * math.sqrt(max(rest, 0.0))
    point = Vector((x, y, z))
    local = point - HEAD_CENTER
    normal = Vector(
        (
            local.x / HEAD_RADII.x**2,
            local.y / HEAD_RADII.y**2,
            local.z / HEAD_RADII.z**2,
        )
    ).normalized()
    return point + normal * out, normal


def facing(normal):
    """A rotation turning a part's front (-Y) to face along the normal."""
    return Vector((0, -1, 0)).rotation_difference(normal).to_matrix()


def line_at(turn, front, side, back):
    """
    How far down the unit head a line comes at a turn around it: `front`
    straight ahead, `side` over the ears and `back` behind, blended smoothly
    between. Heights run from -1 at the chin to 1 at the crown.
    """
    ahead = math.cos(turn)
    if ahead >= 0:
        return lerp(side, front, smoothstep(0, 1, ahead))
    return lerp(side, back, smoothstep(0, 1, -ahead))


def turn_of(d):
    """How far around the head direction d is: 0 ahead, growing to its left."""
    return math.atan2(d.x, -d.y)


def toward(turn, rise):
    """The direction at a turn around the head, `rise` radians above its middle."""
    return Vector(
        (
            math.sin(turn) * math.cos(rise),
            -math.cos(turn) * math.cos(rise),
            math.sin(rise),
        )
    )


def off_head(d, out):
    """The point `out` (a share of the radius) off the head in direction d."""
    point = d * (1 + out)
    return HEAD_CENTER + Vector(
        (point.x * HEAD_RADII.x, point.y * HEAD_RADII.y, point.z * HEAD_RADII.z)
    )


def rise_of(height):
    return math.asin(max(-0.99, min(0.99, height)))


# --- Materials ----------------------------------------------------------------


def material(name):
    found = bpy.data.materials.get(name)
    if found:
        return found
    made = bpy.data.materials.new(name)
    color = hex_to_linear(MATERIALS[name])
    made.diffuse_color = color
    # Every part is closed or sunk into another, so no inside ever shows.
    made.use_backface_culling = True
    if made.node_tree is None:
        made.use_nodes = True
    bsdf = made.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.85
    return made


# --- Meshes -------------------------------------------------------------------


class Part:
    """One object's mesh, put together from shapes in world space."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []

    def _paint(self, verts, name):
        if name not in self.materials:
            self.materials.append(name)
        index = self.materials.index(name)
        for face in {face for vert in verts for face in vert.link_faces}:
            face.material_index = index
            face.smooth = True

    def sphere(self, center, radii, mat, rot=None, deform=None, seg=20, rings=12):
        """
        An ellipsoid. `deform` takes a point on the unit sphere and returns where
        it goes, before the radii, rotation and center apply.
        """
        made = bmesh.ops.create_uvsphere(
            self.bm, u_segments=seg, v_segments=rings, radius=1.0
        )
        verts = made["verts"]
        for vert in verts:
            point = deform(vert.co.copy()) if deform else vert.co.copy()
            point = Vector((point.x * radii[0], point.y * radii[1], point.z * radii[2]))
            if rot is not None:
                point = rot @ point
            vert.co = point + Vector(center)
        self._paint(verts, mat)
        return verts

    def capsule(self, start, end, radius, mat, seg=16, rings=11):
        """A rod with round ends, from start to end."""
        start, end = Vector(start), Vector(end)
        axis = end - start
        half = axis.length / 2
        # An odd ring count leaves no ring on the equator to stretch.
        made = bmesh.ops.create_uvsphere(
            self.bm, u_segments=seg, v_segments=rings, radius=radius
        )
        rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix()
        middle = (start + end) / 2
        for vert in made["verts"]:
            point = vert.co.copy()
            point.z += half if point.z > 0 else -half
            vert.co = rot @ point + middle
        self._paint(made["verts"], mat)
        return made["verts"]

    def tube(self, points, radius, mat, closed=False, sides=10, normal=None):
        """
        A round tube along points, open ends capped with balls. `radius` is one
        number, or one per point to taper it. A closed loop takes the normal of
        the plane it lies in.
        """
        points = [Vector(p) for p in points]
        count = len(points)
        radii = radius if isinstance(radius, (list, tuple)) else [radius] * count
        tangents = []
        for i in range(count):
            if closed:
                tangent = points[(i + 1) % count] - points[i - 1]
            else:
                tangent = points[min(i + 1, count - 1)] - points[max(i - 1, 0)]
            tangents.append(tangent.normalized())

        up = None
        rings = []
        for i, (point, tangent) in enumerate(zip(points, tangents)):
            if normal is not None:
                side = tangent.cross(Vector(normal)).normalized()
                up = side.cross(tangent).normalized()
            elif up is None:
                guess = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((1, 0, 0))
                side = tangent.cross(guess).normalized()
                up = side.cross(tangent).normalized()
            else:
                # Carried along from the last ring, so the tube doesn't twist.
                up = (up - tangent * up.dot(tangent)).normalized()
                side = tangent.cross(up).normalized()
            ring = []
            for k in range(sides):
                angle = 2 * math.pi * k / sides
                offset = side * math.cos(angle) + up * math.sin(angle)
                ring.append(self.bm.verts.new(point + offset * radii[i]))
            rings.append(ring)

        verts = [vert for ring in rings for vert in ring]
        spans = count if closed else count - 1
        for i in range(spans):
            a, b = rings[i], rings[(i + 1) % count]
            for k in range(sides):
                n = (k + 1) % sides
                self.bm.faces.new((a[k], a[n], b[n], b[k]))
        self._paint(verts, mat)
        if not closed:
            for i in (0, count - 1):
                r = radii[i]
                self.sphere(points[i], (r, r, r), mat, seg=sides, rings=7)
        return verts

    def cap(self, start, thick, mat, end=None, segs=64, rings=16):
        """
        A shell over the head from a line up, like hair or a hat. `start(turn)`
        is the height on the unit head its edge runs at, all the way around;
        `thick(d)` how far out it stands in direction d, as a share of the
        head's radius. With `end`, it stops at that line instead of covering
        the crown, for hair worn under a hat.

        Its rows follow the edge, so the edge runs smooth, and it rolls into
        the head there, so it reads as thick from every side.
        """
        bm = self.bm
        # The first rows sit close to the edge, to round it off.
        steps = [(k / rings) ** 1.6 for k in range(rings + 1)]
        roll = [0.5, 0.82, 0.96]

        def rolled(k):
            near = min(k, rings - k) if end else k
            return roll[near] if near < len(roll) else 1.0

        columns = []
        for i in range(segs):
            turn = 2 * math.pi * i / segs
            low = rise_of(start(turn))
            high = rise_of(end(turn)) if end else math.pi / 2 - 0.03
            high = max(high, low + 0.03)
            column = [off_head(toward(turn, low - 0.02), -0.05)]
            for k, step in enumerate(steps):
                d = toward(turn, lerp(low, high, step))
                column.append(off_head(d, thick(d) * rolled(k)))
            if end:
                column.append(off_head(toward(turn, high + 0.02), -0.05))
            columns.append([bm.verts.new(point) for point in column])

        for i in range(segs):
            a, b = columns[i], columns[(i + 1) % segs]
            for k in range(len(a) - 1):
                bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
        verts = [vert for column in columns for vert in column]
        if not end:
            crown = Vector((0, 0, 1))
            pole = bm.verts.new(off_head(crown, thick(crown)))
            for i in range(segs):
                bm.faces.new((columns[i][-1], columns[(i + 1) % segs][-1], pole))
            verts.append(pole)
        self._paint(verts, mat)

    def finish(self, origin=(0, 0, 0), **extras):
        """
        Makes the object. Parts people pick between take an origin at the
        middle of what they cover, so the app can grow them in from there.
        """
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        origin = Vector(origin)
        bmesh.ops.translate(self.bm, vec=-origin, verts=self.bm.verts)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for name in self.materials:
            mesh.materials.append(material(name))
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location = origin
        bpy.context.scene.collection.objects.link(obj)
        for key, value in extras.items():
            obj[key] = value
        return obj


# --- Body ---------------------------------------------------------------------


def build_head():
    part = Part("Head")
    part.sphere(HEAD_CENTER, HEAD_RADII, "Skin", seg=40, rings=24)

    for side in (1, -1):
        # Ears, half in the head.
        part.sphere((side * 0.305, 0.01, 0.83), (0.036, 0.03, 0.05), "Skin")
        # Rosy cheeks, pressed flat against it.
        point, normal = on_head(side * 0.175, 0.775, out=-0.004)
        part.sphere(point, (0.042, 0.008, 0.026), "Cheek", rot=facing(normal))
        # Brows, a short arch above each eye.
        brow = []
        for i in range(6):
            t = i / 5
            x = side * lerp(0.07, 0.14, t)
            z = 0.935 + 0.012 * math.sin(math.pi * t)
            brow.append(on_head(x, z, out=0.006)[0])
        part.tube(brow, [0.008, 0.011, 0.012, 0.012, 0.011, 0.008], "Hair", sides=8)

    point, normal = on_head(0, 0.795, out=0.004)
    part.sphere(point, (0.024, 0.018, 0.017), "Skin", rot=facing(normal))

    smile = []
    for i in range(9):
        t = i / 8
        x = lerp(-0.034, 0.034, t)
        z = 0.765 - 0.014 * math.sin(math.pi * t)
        smile.append(on_head(x, z, out=0.003)[0])
    part.tube(smile, 0.0055, "Mouth", sides=8)
    return part.finish()


def build_eyes():
    """Both eyes in one piece, its origin between them so it can blink."""
    part = Part("Eyes")
    center = None
    for side in (1, -1):
        point, normal = on_head(side * 0.105, 0.835, out=-0.002)
        rot = facing(normal)
        part.sphere(point, (0.034, 0.014, 0.05), "Eye", rot=rot)
        shine = point + rot @ Vector((side * 0.012, -0.012, 0.019))
        part.sphere(shine, (0.011, 0.006, 0.011), "EyeWhite", rot=rot, seg=12, rings=8)
        center = point
    return part.finish(origin=(0, center.y, center.z))


def build_torso(variant):
    part = Part(f"Top_{variant}")
    hoodie = variant == "hoodie"
    grow = 1.04 if hoodie else 1.0

    def shape(p):
        # Narrower at the shoulders, flaring a touch at the hem.
        width = 1 - 0.14 * max(p.z, 0) + 0.06 * max(-p.z, 0)
        return Vector((p.x * width, p.y * width, p.z))

    part.sphere(
        (0, 0, 0.43), (0.165 * grow, 0.14 * grow, 0.2), "Top", deform=shape, seg=32, rings=18
    )
    if hoodie:
        hood = []
        for i in range(13):
            angle = math.radians(lerp(-110, 110, i / 12))
            hood.append((math.sin(angle) * 0.15, math.cos(angle) * 0.13 + 0.02, 0.6 + 0.03 * math.cos(angle)))
        part.tube(hood, 0.05, "Top", sides=12)
        part.sphere((0, 0.15, 0.55), (0.12, 0.05, 0.09), "Top")
        part.sphere((0, -0.13, 0.33), (0.1, 0.022, 0.05), "Top")
        for side in (1, -1):
            part.tube(
                [(side * 0.04, -0.14, 0.565), (side * 0.043, -0.152, 0.51), (side * 0.046, -0.158, 0.46)],
                0.007,
                "Drawstring",
                sides=6,
            )
    return part.finish((0, 0, 0.43), slot="top", variant=variant)


def build_pelvis():
    part = Part("Pelvis")
    part.sphere((0, 0, 0.255), (0.135, 0.115, 0.07), "Bottom")
    return part.finish()


def arm_points(side):
    shoulder = Vector((side * 0.14, 0, 0.51))
    wrist = Vector((side * 0.2, 0, 0.385))
    return shoulder, wrist


def build_arm(side, name):
    part = Part(f"Arm_{name}")
    shoulder, wrist = arm_points(side)
    part.capsule(shoulder, wrist, 0.038, "Skin")
    part.sphere((side * 0.21, 0, 0.35), (0.05, 0.045, 0.056), "Skin")
    part.sphere((side * 0.19, -0.036, 0.366), (0.021, 0.02, 0.024), "Skin", seg=12, rings=8)
    return part.finish()


def build_sleeve(side, name, variant):
    part = Part(f"Sleeve_{variant}_{name}")
    shoulder, wrist = arm_points(side)
    if variant == "tee":
        elbow = shoulder.lerp(wrist, 0.45)
        part.capsule(shoulder, elbow, 0.05, "Top")
    else:
        part.capsule(shoulder, wrist, 0.046, "Top")
        axis = (wrist - shoulder).normalized()
        cuff = []
        for i in range(16):
            angle = 2 * math.pi * i / 16
            ring = Vector((math.cos(angle), math.sin(angle), 0)) * 0.044
            cuff.append(wrist - axis * 0.012 + Vector((0, 0, 1)).rotation_difference(axis).to_matrix() @ ring)
        part.tube(cuff, 0.013, "Top", closed=True, sides=8, normal=axis)
    return part.finish(shoulder, slot="top", variant=variant)


def build_leg(side, name):
    part = Part(f"Leg_{name}")
    part.capsule((side * 0.075, 0, 0.25), (side * 0.075, 0, 0.08), 0.05, "Bottom")

    def toe(p):
        # Rounder and wider at the toe, like a sneaker.
        grow = 1 + 0.12 * max(-p.y, 0)
        return Vector((p.x * grow, p.y, p.z * (1 + 0.08 * max(-p.y, 0))))

    part.sphere((side * 0.075, -0.02, 0.05), (0.062, 0.088, 0.045), "Shoes", deform=toe)
    part.sphere((side * 0.075, -0.022, 0.018), (0.066, 0.092, 0.018), "Sole")
    return part.finish()


# --- Hair ---------------------------------------------------------------------


def bangs(turn, depth, count):
    """Scallops across the forehead, fading out toward the ears."""
    return depth * math.cos(turn * count) * smoothstep(0.35, 0.85, math.cos(turn))


def volume(d, base, crown):
    """Thicker toward the crown, so hair sits up off the head."""
    return base + crown * smoothstep(0.2, 1, d.z)


random.seed(7)
CURLS = []
while len(CURLS) < 70:
    p = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))
    if 0.05 < p.length <= 1:
        CURLS.append(p.normalized())


def curls(d):
    """Round bumps all over, like a head of curls."""
    bumps = 0.0
    for curl in CURLS:
        near = 1 - (d - curl).length / 0.38
        if near > 0:
            bumps = max(bumps, near * near)
    return bumps


# Each style: where its edge runs, and how thick it is.
HAIR = {
    "short": (
        lambda turn: line_at(turn, 0.42, -0.12, -0.5) + bangs(turn, 0.05, 9),
        lambda d: volume(d, 0.06, 0.05),
    ),
    "long": (
        # Parted to one side.
        lambda turn: line_at(turn, 0.4, -0.35, -0.75)
        + 0.08 * smoothstep(-0.3, 0.3, math.sin(turn)) * smoothstep(0.35, 0.85, math.cos(turn)),
        lambda d: volume(d, 0.06, 0.05),
    ),
    "bun": (
        lambda turn: line_at(turn, 0.5, -0.1, -0.45),
        lambda d: 0.035,
    ),
    "curly": (
        lambda turn: line_at(turn, 0.36, -0.15, -0.55) + 0.03 * math.sin(turn * 14),
        lambda d: volume(d, 0.08, 0.06) + 0.07 * curls(d),
    ),
}


def under_hat(turn):
    """Where hair worn under a hat stops, a little up under its brim."""
    return line_at(turn, *HAT_LINE) + 0.07


def build_hair(variant, hat):
    name = f"Hair_{variant}{'_hat' if hat else ''}"
    part = Part(name)
    start, thick = HAIR[variant]
    part.cap(start, thick, "Hair", end=under_hat if hat else None)

    if variant == "long":
        # Falling behind the head to the shoulders, in soft waves.
        def waves(p):
            around = math.atan2(p.x, p.y)
            grow = 1 + 0.05 * math.cos(around * 9) * smoothstep(0.6, -0.2, p.z)
            drop = 0.12 * max(-p.z, 0) ** 2 * math.cos(around * 9)
            return Vector((p.x * grow, p.y * grow, p.z - drop))

        part.sphere((0, 0.16, 0.75), (0.31, 0.16, 0.3), "Hair", deform=waves, seg=40, rings=18)
        # And a lock either side of the face, tapering to a tip.
        for side in (1, -1):
            part.tube(
                [
                    (side * 0.27, -0.13, 0.9),
                    (side * 0.3, -0.1, 0.79),
                    (side * 0.295, -0.07, 0.7),
                    (side * 0.27, -0.04, 0.62),
                ],
                [0.04, 0.042, 0.032, 0.016],
                "Hair",
                sides=12,
            )
    if variant == "bun" and not hat:
        part.sphere((0, 0.1, 1.17), (0.11, 0.1, 0.1), "Hair", seg=24, rings=14)
        band = [
            (math.cos(a) * 0.075, 0.08 + math.sin(a) * 0.07, 1.1)
            for a in (2 * math.pi * i / 16 for i in range(16))
        ]
        part.tube(band, 0.016, "Hair", closed=True, sides=8, normal=(0, 0, 1))
    return part.finish(HEAD_CENTER, slot="hair", variant=variant, hat=1 if hat else 0)


# --- Hats ---------------------------------------------------------------------


def build_beanie():
    part = Part("Hat_beanie")

    def knit(d):
        above = d.z - line_at(turn_of(d), *HAT_LINE)
        # A folded cuff at the brim, ribbed above it.
        cuff = 0.035 * (1 - smoothstep(0.2, 0.25, above))
        rib = 0.006 * math.cos(turn_of(d) * 28) * smoothstep(0.25, 0.32, above)
        return 0.13 + cuff + rib

    part.cap(lambda turn: line_at(turn, *HAT_LINE), knit, "Hat", segs=84, rings=18)
    part.sphere((0, 0.02, 1.2), (0.075, 0.075, 0.07), "Hat", seg=20, rings=12)
    return part.finish(HEAD_CENTER, slot="hat", variant="beanie")


def build_cap():
    part = Part("Hat_cap")
    part.cap(lambda turn: line_at(turn, 0.38, 0.28, 0.12), lambda d: 0.12, "Hat")
    part.sphere((0, 0, 1.165), (0.025, 0.025, 0.012), "Hat", seg=12, rings=8)

    def visor(p):
        # Only the front half, curved down at the sides.
        y = min(p.y, 0.0)
        return Vector((p.x, y, p.z - 0.25 * p.x * p.x))

    tilt = Euler((math.radians(-12), 0, 0)).to_matrix()
    part.sphere((0, -0.27, 1.0), (0.22, 0.22, 0.016), "Hat", rot=tilt, deform=visor, seg=32, rings=10)
    return part.finish(HEAD_CENTER, slot="hat", variant="cap")


def build_chef():
    part = Part("Hat_chef")
    # The band: from the hat line around the head, straight up to the puff.
    bm = part.bm
    sides = 48
    columns = []
    for i in range(sides):
        turn = 2 * math.pi * i / sides
        rise = rise_of(line_at(turn, *HAT_LINE))
        brim = off_head(toward(turn, rise), 0.12)
        top = Vector((math.sin(turn) * 0.33, -math.cos(turn) * 0.315, 1.14))
        column = [off_head(toward(turn, rise - 0.02), -0.05), off_head(toward(turn, rise), 0.08), brim]
        column += [brim.lerp(top, t) for t in (0.33, 0.66, 1.0)]
        columns.append([bm.verts.new(point) for point in column])
    for i in range(sides):
        a, b = columns[i], columns[(i + 1) % sides]
        for k in range(len(a) - 1):
            bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
    part._paint([vert for column in columns for vert in column], "Hat")
    # The puff: a big soft top and lobes around it.
    part.sphere((0, 0, 1.25), (0.33, 0.31, 0.15), "Hat", seg=32, rings=14)
    for i in range(7):
        a = 2 * math.pi * i / 7 + 0.3
        part.sphere((math.cos(a) * 0.2, math.sin(a) * 0.19, 1.24), (0.15, 0.15, 0.13), "Hat")
    part.sphere((0, 0, 1.33), (0.19, 0.18, 0.1), "Hat")
    return part.finish(HEAD_CENTER, slot="hat", variant="chef")


# --- Glasses ------------------------------------------------------------------

EYE_X = 0.105
EYE_Z = 0.84


def lens_frame(side, outline):
    """
    Where a lens sits in front of an eye, and its outline there: points in the
    lens's plane, turned a little to follow the face.
    """
    point, normal = on_head(side * EYE_X, EYE_Z)
    center = point + Vector((0, -0.04, 0))
    yaw = Matrix.Rotation(math.radians(-side * 12), 3, "Z")
    return center, yaw, [center + yaw @ Vector((x, 0, z)) for x, z in outline]


def round_outline(rx, rz, count=28):
    return [
        (math.cos(2 * math.pi * i / count) * rx, math.sin(2 * math.pi * i / count) * rz)
        for i in range(count)
    ]


def rounded_rect(w, h, r, per=6):
    points = []
    corners = ((w - r, h - r, 0), (-w + r, h - r, 90), (-w + r, -h + r, 180), (w - r, -h + r, 270))
    for cx, cz, start in corners:
        for i in range(per + 1):
            a = math.radians(start + 90 * i / per)
            points.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return points


def aviator(w, h):
    """Wider at the top and dropping to a rounded point inside and below."""
    points = []
    for i in range(32):
        a = 2 * math.pi * i / 32
        x, z = math.cos(a), math.sin(a)
        z = z * h * (1 + 0.25 * max(-z, 0)) + h * 0.15 * max(-z, 0) * x
        points.append((x * w * (1 - 0.1 * max(-math.sin(a), 0)), z))
    return points


def build_glasses(variant):
    part = Part(f"Glasses_{variant}")
    shapes = {
        "round": round_outline(0.068, 0.064),
        "square": rounded_rect(0.072, 0.056, 0.022),
        "shades": aviator(0.074, 0.058),
    }
    outer = []
    for side in (1, -1):
        outline = [(side * x, z) for x, z in shapes[variant]]
        center, yaw, points = lens_frame(side, outline)
        normal = yaw @ Vector((0, -1, 0))
        part.tube(points, 0.0085, "Frame", closed=True, sides=8, normal=normal)
        if variant == "shades":
            # Dark lenses, filling the frame.
            verts = [part.bm.verts.new(p + normal * -0.002) for p in points]
            face = part.bm.faces.new(verts)
            part._paint(verts, "Lens")
            face.smooth = False
        widest = max(points, key=lambda p: side * p.x)
        outer.append((side, widest, center))

    # The bridge over the nose.
    (_, _, left), (_, _, right) = outer
    bridge = [
        left + Vector((-0.065, 0, 0.012)),
        Vector((0, left.y - 0.006, left.z + 0.02)),
        right + Vector((0.065, 0, 0.012)),
    ]
    part.tube(bridge, 0.007, "Frame", sides=8)

    # Temples, running back around the head to the ears.
    for side, start, _ in outer:
        path = [start]
        z = EYE_Z + 0.01
        rest = 1 - ((z - HEAD_CENTER.z) / HEAD_RADII.z) ** 2
        rx = HEAD_RADII.x * math.sqrt(rest) + 0.014
        ry = HEAD_RADII.y * math.sqrt(rest) + 0.014
        begin = math.asin(min(abs(start.x) / rx, 1.0))
        for i in range(1, 9):
            angle = lerp(begin, math.radians(96), i / 8)
            path.append(Vector((side * math.sin(angle) * rx, -math.cos(angle) * ry, z)))
        part.tube(path, 0.006, "Frame", sides=6)
    return part.finish(HEAD_CENTER, slot="glasses", variant=variant)


# --- Rig ----------------------------------------------------------------------


def build_armature():
    data = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Character", data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in BONES.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        bone.roll = 0
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
    return rig


def attach(rig, obj, bone):
    # Not yet parented, so its own transform is where it is in the world.
    world = obj.matrix_basis.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = world


# --- Animation ----------------------------------------------------------------
#
# A pose is {bone: {"rot": (x, y, z), "loc": (x, y, z), "scale": (x, y, z)}},
# in degrees and the character's own axes, whatever way each bone points. The
# character faces -Y, so for the legs and arms, which hang down, a negative X
# turn swings them forward; for the spine and head, which point up, a positive
# one leans them forward. Raising the left arm out to the side is a negative Y
# turn, the right a positive one.


def to_bone(rig, name, pose):
    rest = rig.data.bones[name].matrix_local.to_3x3()
    rest_q = rest.to_quaternion()
    euler = pose.get("rot", (0, 0, 0))
    turn = Euler(tuple(math.radians(a) for a in euler), "XYZ").to_quaternion()
    rotation = rest_q.inverted() @ turn @ rest_q
    location = rest.inverted() @ Vector(pose.get("loc", (0, 0, 0)))
    scale_world = pose.get("scale", (1, 1, 1))
    scale = []
    for i in range(3):
        column = rest.col[i]
        scale.append(scale_world[max(range(3), key=lambda k: abs(column[k]))])
    return rotation, location, Vector(scale)


def record(rig, name, frames, pose_at, loop):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame in range(frames + 1):
        t = frame / frames
        pose = pose_at(t)
        for bone in rig.pose.bones:
            rotation, location, scale = to_bone(rig, bone.name, pose.get(bone.name, {}))
            bone.rotation_quaternion = rotation
            bone.location = location
            bone.scale = scale
            for path in ("rotation_quaternion", "location", "scale"):
                bone.keyframe_insert(path, frame=frame, group=bone.name)
    for curve in action_curves(rig, action):
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    action.use_frame_range = True
    action.frame_start, action.frame_end = 0, frames
    action.use_cyclic = loop
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    rig.animation_data.action = None
    return action


def action_curves(rig, action):
    """The action's F-curves, whichever way this Blender keeps them."""
    if hasattr(action, "fcurves") and len(action.fcurves):
        return list(action.fcurves)
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                curves.extend(bag.fcurves)
    return curves


def wave_of(t, cycles=1, phase=0.0):
    return math.sin(2 * math.pi * (t * cycles + phase))


def blend(keys, t):
    """Eases between key poses, given as (t, pose) in order."""
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            k = ease((t - t0) / (t1 - t0)) if t1 > t0 else 1
            break
    else:
        return keys[-1][1]
    pose = {}
    for bone in set(a) | set(b):
        pose[bone] = {}
        for channel, base in (("rot", (0, 0, 0)), ("loc", (0, 0, 0)), ("scale", (1, 1, 1))):
            va = a.get(bone, {}).get(channel, base)
            vb = b.get(bone, {}).get(channel, base)
            pose[bone][channel] = tuple(lerp(x, y, k) for x, y in zip(va, vb))
    return pose


def idle(t):
    breath = wave_of(t)
    return {
        "root": {"rot": (0, 1.2 * wave_of(t, 1, 0.25), 0)},
        "spine": {"scale": (1 + 0.012 * breath, 1 + 0.012 * breath, 1 + 0.025 * breath)},
        "head": {"rot": (2 * wave_of(t, 1, 0.1), 2.5 * wave_of(t, 1, 0.3), 1.5 * wave_of(t, 1, 0.6))},
        "arm_L": {"rot": (1.5 * wave_of(t, 1, 0.2), -2 - 2 * breath, 0)},
        "arm_R": {"rot": (1.5 * wave_of(t, 1, 0.2), 2 + 2 * breath, 0)},
    }


def stride(swing, arms, lean, bob, twist):
    def pose(t):
        s = wave_of(t)
        lift = bob * 0.5 * (1 + math.cos(4 * math.pi * t))
        return {
            "root": {"loc": (0, 0, lift), "rot": (0, 2 * s, 0)},
            "hips": {"rot": (0, 0, -0.6 * twist * s)},
            "spine": {"rot": (lean, 0, twist * s)},
            "head": {"rot": (-lean * 0.6, 1.5 * s, -0.8 * twist * s)},
            "leg_L": {"rot": (-swing * s, 0, 0)},
            "leg_R": {"rot": (swing * s, 0, 0)},
            "arm_L": {"rot": (arms * s, -4 - abs(s) * arms * 0.15, 0)},
            "arm_R": {"rot": (-arms * s, 4 + abs(s) * arms * 0.15, 0)},
        }

    return pose


def jump(t):
    frame = t * 33
    keys = [
        (0, {}),
        (6, {
            "root": {"scale": (1.12, 1.12, 0.84)},
            "spine": {"rot": (10, 0, 0)},
            "head": {"rot": (-6, 0, 0)},
            "arm_L": {"rot": (35, -8, 0)},
            "arm_R": {"rot": (35, 8, 0)},
        }),
        (9, {
            "root": {"scale": (0.9, 0.9, 1.14)},
            "spine": {"rot": (-4, 0, 0)},
            "arm_L": {"rot": (-10, -150, 0)},
            "arm_R": {"rot": (-10, 150, 0)},
            "leg_L": {"rot": (10, 0, 0)},
            "leg_R": {"rot": (10, 0, 0)},
        }),
        (15, {
            "head": {"rot": (-4, 0, 0)},
            "arm_L": {"rot": (-5, -120, 0)},
            "arm_R": {"rot": (-5, 120, 0)},
            "leg_L": {"rot": (-22, 0, 0)},
            "leg_R": {"rot": (-14, 0, 0)},
        }),
        (21, {
            "root": {"scale": (0.95, 0.95, 1.06)},
            "arm_L": {"rot": (0, -60, 0)},
            "arm_R": {"rot": (0, 60, 0)},
        }),
        (24, {
            "root": {"scale": (1.14, 1.14, 0.84)},
            "spine": {"rot": (8, 0, 0)},
            "arm_L": {"rot": (15, -30, 0)},
            "arm_R": {"rot": (15, 30, 0)},
        }),
        (33, {}),
    ]
    pose = blend([(f / 33, p) for f, p in keys], t)
    # In the air from frame 9 to 21, on a parabola.
    if 9 <= frame <= 21:
        u = (frame - 9) / 12
        pose.setdefault("root", {})["loc"] = (0, 0, 0.42 * 4 * u * (1 - u))
    return pose


def wave(t):
    raised = lambda angle: {  # noqa: E731
        "arm_R": {"rot": (-22, angle, 0)},
        "arm_L": {"rot": (0, -6, 0)},
        "head": {"rot": (0, -6, 0)},
        "spine": {"rot": (0, -3, 0)},
    }
    # Short arms on a big head: past about 135 degrees the hand hides behind it.
    keys = [(0, {}), (8, raised(125))]
    for i, frame in enumerate(range(14, 39, 6)):
        keys.append((frame, raised(100 if i % 2 == 0 else 132)))
    keys += [(41, raised(118)), (48, {})]
    return blend([(f / 48, p) for f, p in keys], t)


def dance(t):
    sway = wave_of(t)
    bounce = 0.025 * 0.5 * (1 - math.cos(8 * math.pi * t))
    return {
        "root": {"loc": (0.04 * sway, 0, bounce), "rot": (0, -6 * sway, 0)},
        "spine": {"rot": (0, 0, 8 * sway)},
        "head": {"rot": (4 * wave_of(t, 4), 8 * sway, 0)},
        "arm_L": {"rot": (-20, -(100 + 50 * sway), 0)},
        "arm_R": {"rot": (-20, 100 - 50 * sway, 0)},
        "leg_L": {"rot": (-10 * max(sway, 0), -4, 0)},
        "leg_R": {"rot": (10 * min(sway, 0), 4, 0)},
    }


# --- Build --------------------------------------------------------------------


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for item in list(block):
            block.remove(item)


def build():
    clear()
    bpy.context.scene.render.fps = FPS
    rig = build_armature()

    attach(rig, build_head(), "head")
    attach(rig, build_eyes(), "head")
    attach(rig, build_pelvis(), "hips")
    for side, name in ((1, "L"), (-1, "R")):
        attach(rig, build_arm(side, name), f"arm_{name}")
        attach(rig, build_leg(side, name), f"leg_{name}")
        for variant in ("tee", "hoodie"):
            attach(rig, build_sleeve(side, name, variant), f"arm_{name}")
    for variant in ("tee", "hoodie"):
        attach(rig, build_torso(variant), "spine")
    for variant in ("short", "long", "bun", "curly"):
        for hat in (False, True):
            attach(rig, build_hair(variant, hat), "head")
    attach(rig, build_beanie(), "head")
    attach(rig, build_cap(), "head")
    attach(rig, build_chef(), "head")
    for variant in ("round", "square", "shades"):
        attach(rig, build_glasses(variant), "head")

    record(rig, "idle", 72, idle, loop=True)
    record(rig, "walk", 24, stride(swing=30, arms=25, lean=5, bob=0.025, twist=6), loop=True)
    record(rig, "run", 16, stride(swing=45, arms=55, lean=12, bob=0.05, twist=9), loop=True)
    record(rig, "jump", 33, jump, loop=False)
    record(rig, "wave", 48, wave, loop=False)
    record(rig, "dance", 48, dance, loop=True)
    return rig


def export(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = path.with_suffix(".raw.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(raw),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
    )
    # Quantized and meshopt-compressed: about a sixth of the size, and three.js
    # decodes it without fetching a decoder.
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
