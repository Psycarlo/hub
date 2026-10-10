"""
Builds the hub's 3D character and writes it to
src/features/character/character.glb.

Everything is made here, from code, so the model can be changed in review and
rebuilt the same way every time. The look is chibi, after Animal Crossing and
Overcooked: a big round head, a small body, short arms ending in mitten hands,
and stubby legs in round shoes.

Every part is rigid and parented to one bone, so nothing bends and nothing
needs skin weights. Parts that people pick between are all in the file, tagged
with glTF extras that the app reads:

  slot     the field of convex/shared/character.ts it's picked by: "eyes",
           "mouth", "cheeks", "facialHair", "hair", "hat", "glasses", "top"
           or "bottom"
  variant  the option's id there, or several separated by spaces when one
           part serves more than one option
  hat      on hair: 1 for the version worn under a hat that covers it, cut
           and pressed down to fit under it
  lift     on hair: how far it stands off the crown, as a share of the head's
           radius, for hats that perch on it rather than cover it
  perch    on hats: 1 for those that sit on the hair, like a crown
  top      on overalls: the top they're shaped to fit over
  body     on parts made for one body, "male" or "female": its tops and its
           eyes

Materials are named for what they color ("Skin", "Hair", "Top"...), and the
app recolors them per person; "TopTrim" and the like it works out from those.
Animations are actions on the armature, one per move: idle, walk, run, jump,
wave, dance and cheer standing; drink, at the office's coffee machine; and
sit, type and doze, seated on a seat SEAT high, which blender/office.py builds
every seat to.

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
    "Cushion": "#2b2b33",
    "Drawstring": "#f4f1ea",
    "EarInner": "#ffb3c1",
    "Eye": "#1f1b24",
    "EyeWhite": "#ffffff",
    "Frame": "#2b2b33",
    "Freckle": "#b5714a",
    "Gem": "#e5484d",
    "Gold": "#f2c14e",
    "Hair": "#5a3825",
    "HairTie": "#e5484d",
    "Hat": "#e05d5d",
    "HatAccent": "#f4f1ea",
    "Lens": "#20263a",
    "Mouth": "#8a3b3b",
    "Shoes": "#e5484d",
    "ShoesTrim": "#f4f1ea",
    "Skin": "#f2c29b",
    "Sole": "#8e7f74",
    "Teeth": "#ffffff",
    "Tongue": "#ff8a8a",
    "Top": "#ff7a59",
    "TopAccent": "#f4f1ea",
    "TopTrim": "#d9603f",
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

# Where hats that cover the hair come down to, as heights on the unit head (-1
# chin, 1 crown) at the front, the sides and the back. Every one of them comes
# down to here, so one cut of each hairstyle fits under them all.
HAT_LINE = (0.45, 0.25, 0.05)
# How thick hair can be under such a hat: they all stand further off than this.
UNDER_HAT = 0.085

# The torsos every top is turned from, one for each body, as (radius, height)
# from the neck down, flattened front to back by DEPTH. Tops scale them out to
# sit over each other. The female one is narrower at the shoulders and waist,
# and flares a little at the hips.
BODIES = {
    "male": [
        (0.0, 0.63),
        (0.065, 0.624),
        (0.105, 0.61),
        (0.135, 0.588),
        (0.152, 0.56),
        (0.162, 0.525),
        (0.166, 0.48),
        (0.167, 0.42),
        (0.165, 0.36),
        (0.16, 0.3),
        (0.154, 0.27),
        (0.15, 0.25),
    ],
    "female": [
        (0.0, 0.63),
        (0.058, 0.624),
        (0.094, 0.61),
        (0.12, 0.588),
        (0.134, 0.56),
        (0.142, 0.525),
        (0.144, 0.48),
        (0.136, 0.43),
        (0.14, 0.38),
        (0.154, 0.32),
        (0.167, 0.28),
        (0.171, 0.25),
    ],
}
DEPTH = 0.82
HEM = 0.258


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


def radius_at(profile, z):
    """A turned shape's radius at height z, between its (radius, height) points."""
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        if z1 <= z <= z0:
            return lerp(r0, r1, (z0 - z) / (z0 - z1)) if z0 != z1 else r1
    return profile[-1][0] if z < profile[-1][1] else profile[0][0]


def on_torso(scale, x, z, back=False, out=0.0, body="male"):
    """
    The point on the front (or back) of a top scaled from a body at x and z,
    and the way it faces.
    """
    shape = BODIES[body]
    r = radius_at(shape, z) * scale
    x = max(-r * 0.995, min(r * 0.995, x))
    y = DEPTH * math.sqrt(r * r - x * x) * (1 if back else -1)
    slope = (radius_at(shape, z + 0.005) - radius_at(shape, z - 0.005)) * scale / 0.01
    normal = Vector((x / r**2, y / (r * DEPTH) ** 2, -slope / r)).normalized()
    return Vector((x, y, z)) + normal * out, normal


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

    def cap(self, start, thick, mat, end=None, segs=56, rings=14):
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

    def lathe(self, profile, mat, segs=40, depth=1.0, wobble=None, base=(0, 0, 0), axis=(0, 0, 1)):
        """
        A shape turned around an axis from (radius, height) points in order; a
        radius of 0 closes it there. `depth` flattens it front to back, and
        `wobble(turn, height)` scales the radius, for ribs and pleats. Turns
        start at the front (-Y) and grow toward the left.
        """
        rot = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()).to_matrix()
        base = Vector(base)
        rings = []
        for r, h in profile:
            if r <= 0:
                rings.append([self.bm.verts.new(base + rot @ Vector((0, 0, h)))])
                continue
            ring = []
            for i in range(segs):
                turn = 2 * math.pi * i / segs
                k = wobble(turn, h) if wobble else 1.0
                local = Vector((math.sin(turn) * r * k, -math.cos(turn) * r * k * depth, h))
                ring.append(self.bm.verts.new(base + rot @ local))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1 or len(b) == 1:
                pole, ring = (a[0], b) if len(a) == 1 else (b[0], a)
                for i in range(len(ring)):
                    self.bm.faces.new((ring[i], ring[(i + 1) % len(ring)], pole))
                continue
            for i in range(len(a)):
                n = (i + 1) % len(a)
                self.bm.faces.new((a[i], a[n], b[n], b[i]))
        verts = [vert for ring in rings for vert in ring]
        self._paint(verts, mat)
        return verts

    def cone(self, base, axis, length, r0, r1, mat, sides=12):
        """A cone standing on a base point along an axis, its tip rounded off."""
        steps = 6
        profile = [(0.0, -0.005), (r0, 0.0)]
        profile += [(lerp(r0, r1, k / steps), length * k / steps) for k in range(1, steps + 1)]
        self.lathe(profile, mat, segs=sides, base=base, axis=axis)
        tip = Vector(base) + Vector(axis).normalized() * length
        self.sphere(tip, (r1, r1, r1), mat, seg=sides, rings=5)

    def patch(self, surface, outline, thick, mat, rings=6):
        """
        A raised panel pressed onto a surface, like a pocket or a bib.
        `surface(x, z)` gives a point on it and the way it faces; `outline` is
        the panel's edge as (x, z) points around its middle. Its top is flat
        and its edge rolls down into the surface.
        """
        cx = sum(x for x, _ in outline) / len(outline)
        cz = sum(z for _, z in outline) / len(outline)

        def lifted(x, z, height):
            point, normal = surface(x, z)
            return point + normal * height

        steps = [1 - (1 - k / rings) ** 1.7 for k in range(1, rings + 1)]
        center = self.bm.verts.new(lifted(cx, cz, thick))
        loops = []
        for t in steps:
            height = thick * max(1 - t**8, 0) ** 0.5
            loops.append(
                [self.bm.verts.new(lifted(cx + (x - cx) * t, cz + (z - cz) * t, height)) for x, z in outline]
            )
        loops.append([self.bm.verts.new(lifted(x, z, -0.004)) for x, z in outline])
        count = len(outline)
        for i in range(count):
            self.bm.faces.new((center, loops[0][i], loops[0][(i + 1) % count]))
        for a, b in zip(loops, loops[1:]):
            for i in range(count):
                n = (i + 1) % count
                self.bm.faces.new((a[i], b[i], b[n], a[n]))
        verts = [center] + [vert for loop in loops for vert in loop]
        self._paint(verts, mat)
        return verts

    def band(self, turns, low, high, thick, mat, segs=40, rings=12):
        """
        A shell on the head between two lines, `low(turn)` and `high(turn)`,
        over a range of turns, like a beard. It rolls into the head on every
        side.
        """
        roll = [None, 0.5, 0.82, 0.96]

        def rolled(n):
            return roll[n] if n < len(roll) else 1.0

        columns = []
        for i in range(segs + 1):
            turn = lerp(turns[0], turns[1], i / segs)
            bottom, top = rise_of(low(turn)), rise_of(high(turn))
            top = max(top, bottom + 0.03)
            side = rolled(min(i, segs - i))
            column = [off_head(toward(turn, bottom - 0.02), -0.05)]
            for k in range(rings + 1):
                step = 0.5 - 0.5 * math.cos(math.pi * k / rings)
                d = toward(turn, lerp(bottom, top, step))
                edge = rolled(min(k, rings - k) + 1)
                out = -0.05 if side is None else thick(d) * side * edge
                column.append(off_head(d, out))
            column.append(off_head(toward(turn, top + 0.02), -0.05))
            columns.append([self.bm.verts.new(point) for point in column])
        for a, b in zip(columns, columns[1:]):
            for k in range(len(a) - 1):
                self.bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
        verts = [vert for column in columns for vert in column]
        self._paint(verts, mat)
        return verts

    def finish(self, origin=(0, 0, 0), **extras):
        """
        Makes the object. Parts people pick between take an origin at the
        middle of what they cover, so the app can grow them in from there.
        """
        # Fresh faces have no normals yet, and the recalculation guesses
        # inside from outside by them.
        self.bm.normal_update()
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


# --- Shapes -------------------------------------------------------------------


def squircle(count, power=4):
    """A rounded square's outline, from -1 to 1 each way."""
    points = []
    for i in range(count):
        a = 2 * math.pi * i / count
        c, s = math.cos(a), math.sin(a)
        points.append(
            (math.copysign(abs(c) ** (2 / power), c), math.copysign(abs(s) ** (2 / power), s))
        )
    return points


def standing(up, ahead=Vector((0, -1, 0))):
    """A rotation standing a part's Z along `up`, its front (-Y) turned ahead."""
    z = up.normalized()
    y = -(ahead - z * ahead.dot(z)).normalized()
    return Matrix((y.cross(z), y, z)).transposed()


def ring_points(center, axis, radius, count):
    """Points in a circle around an axis."""
    axis = Vector(axis).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(axis).to_matrix()
    return [
        Vector(center) + rot @ Vector((math.cos(a), math.sin(a), 0)) * radius
        for a in (2 * math.pi * i / count for i in range(count))
    ]


def ribbed(count, radius, ridges, depth=0.12):
    """Tube radii around a loop, swelling and thinning into knitted ridges."""
    return [radius * (1 + depth * math.cos(2 * math.pi * ridges * i / count)) for i in range(count)]


# --- Face ---------------------------------------------------------------------

EYES = ("round", "happy", "sleepy", "sparkly")
MOUTHS = ("smile", "grin", "cat", "wow")
CHEEKS = ("rosy", "freckles")
FACIAL_HAIR = ("mustache", "beard", "goatee")


def build_head():
    """The head itself: skin, ears, nose and brows. The rest of the face is picked."""
    part = Part("Head")
    part.sphere(HEAD_CENTER, HEAD_RADII, "Skin", seg=40, rings=24)
    for side in (1, -1):
        # Ears, half in the head.
        part.sphere((side * 0.305, 0.01, 0.83), (0.036, 0.03, 0.05), "Skin")
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
    return part.finish()


def lashes(part, side, variant):
    """Flicks of lashes off the outer corner of an eye, curling up and out."""
    x = side * 0.105
    if variant == "happy":
        roots = [(x + side * 0.032, 0.826, -20), (x + side * 0.03, 0.834, 15)]
    elif variant == "sleepy":
        roots = [(x + side * 0.04, 0.828, -15), (x + side * 0.032, 0.831, 15)]
    else:
        rx, rz = (0.04, 0.057) if variant == "sparkly" else (0.034, 0.05)
        roots = []
        for degrees in (15, 40, 65):
            a = math.radians(degrees)
            roots.append((x + side * rx * math.cos(a), 0.835 + rz * math.sin(a), degrees * 0.6 + 10))
    for px, pz, angle in roots:
        a = math.radians(angle)
        tx, tz = px + side * 0.024 * math.cos(a), pz + 0.024 * math.sin(a)
        path = [
            on_head(px, pz, out=0.004)[0],
            on_head(lerp(px, tx, 0.5), lerp(pz, tz, 0.5) + 0.002, out=0.008)[0],
            on_head(tx, tz, out=0.012)[0],
        ]
        part.tube(path, [0.0045, 0.0032, 0.0012], "Eye", sides=6)


def build_eyes(variant, body):
    """Both eyes in one piece, so they blink together; lashes on the female body."""
    part = Part(named(f"Eyes_{variant}", body))
    if body == "female":
        for side in (1, -1):
            lashes(part, side, variant)
    for side in (1, -1):
        x = side * 0.105
        if variant == "happy":
            # Shut, and smiling: ^ ^
            arc = [
                on_head(x + 0.032 * math.cos(a), 0.826 + 0.024 * math.sin(a), out=0.004)[0]
                for a in (math.pi * i / 10 for i in range(11))
            ]
            part.tube(arc, 0.0095, "Eye", sides=8)
            continue
        if variant == "sleepy":
            # Lids half down: each eye cut flat across the top, under a lid.
            point, normal = on_head(x, 0.824, out=-0.002)

            def lidded(p):
                return Vector((p.x, p.y, min(p.z, 0.2)))

            part.sphere(point, (0.034, 0.013, 0.04), "Eye", rot=facing(normal), deform=lidded)
            lid = [
                on_head(x + 0.04 * u, 0.832 - 0.004 * u * u, out=0.006)[0]
                for u in (i / 4 - 1 for i in range(9))
            ]
            part.tube(lid, 0.0065, "Eye", sides=8)
            continue
        big = variant == "sparkly"
        point, normal = on_head(x, 0.835, out=-0.002)
        rot = facing(normal)
        part.sphere(point, (0.04, 0.015, 0.057) if big else (0.034, 0.014, 0.05), "Eye", rot=rot)
        shine = 0.014 if big else 0.011
        spot = point + rot @ Vector((side * 0.013, -0.013, 0.02))
        part.sphere(spot, (shine, 0.006, shine), "EyeWhite", rot=rot, seg=12, rings=8)
        if big:
            spot = point + rot @ Vector((-side * 0.013, -0.014, -0.024))
            part.sphere(spot, (0.0065, 0.004, 0.0065), "EyeWhite", rot=rot, seg=10, rings=6)
    return part.finish(slot="eyes", variant=variant, body=body)


def on_face(x, z):
    return on_head(x, z)


def build_mouth(variant):
    part = Part(f"Mouth_{variant}")
    if variant == "smile":
        smile = [
            on_head(lerp(-0.034, 0.034, t), 0.765 - 0.014 * math.sin(math.pi * t), out=0.003)[0]
            for t in (i / 8 for i in range(9))
        ]
        part.tube(smile, 0.0055, "Mouth", sides=8)
    elif variant == "grin":
        # Wide open: a D, teeth along the top and the tongue at the bottom.
        outline = []
        for i in range(32):
            a = 2 * math.pi * i / 32
            s = math.sin(a)
            outline.append((0.05 * math.cos(a), 0.775 + (0.004 * s if s > 0 else 0.04 * s)))
        part.patch(on_face, outline, 0.003, "Mouth", rings=4)
        teeth = [(x * 0.036, 0.7695 + z * 0.005) for x, z in squircle(24, 4)]
        part.patch(on_face, teeth, 0.0055, "Teeth", rings=3)
        tongue = [(x * 0.024, 0.746 + z * 0.01) for x, z in squircle(24, 2.4)]
        part.patch(on_face, tongue, 0.0055, "Tongue", rings=3)
    elif variant == "cat":
        # :3
        curve = [
            on_head(0.036 * u, 0.772 - 0.012 * abs(math.sin(math.pi * u)), out=0.003)[0]
            for u in (i / 8 - 1 for i in range(17))
        ]
        part.tube(curve, 0.0055, "Mouth", sides=8)
    else:
        # Surprised: a little o.
        outline = [(x * 0.016, 0.758 + z * 0.02) for x, z in squircle(24, 2)]
        part.patch(on_face, outline, 0.004, "Mouth", rings=3)
    return part.finish(slot="mouth", variant=variant)


def build_cheeks(variant):
    part = Part(f"Cheeks_{variant}")
    for side in (1, -1):
        # Rosy, pressed flat against the head.
        point, normal = on_head(side * 0.175, 0.775, out=-0.004)
        part.sphere(point, (0.042, 0.008, 0.026), "Cheek", rot=facing(normal))
        if variant == "freckles":
            for dx, dz in ((-0.03, 0.03), (-0.008, 0.039), (0.014, 0.031), (0.033, 0.04)):
                spot, normal = on_head(side * (0.175 + dx), 0.775 + dz, out=-0.001)
                part.sphere(spot, (0.0065, 0.003, 0.0065), "Freckle", rot=facing(normal), seg=8, rings=6)
    return part.finish(slot="cheeks", variant=variant)


def mustache(part, size=1.0):
    for side in (1, -1):
        path = [
            on_head(side * x, z, out=0.006)[0]
            for x, z in ((0.004, 0.779), (0.026, 0.777), (0.05, 0.773), (0.068, 0.782))
        ]
        part.tube(path, [r * size for r in (0.011, 0.015, 0.012, 0.006)], "Hair", sides=10)


def build_facial_hair(variant):
    part = Part(f"FacialHair_{variant}")
    mustache(part, 0.8 if variant == "goatee" else 1.0)
    if variant == "beard":
        # Along the jaw from ear to ear, fuller at the chin.
        part.band(
            (-1.75, 1.75),
            lambda turn: -0.92,
            lambda turn: lerp(-0.47, 0.0, smoothstep(0.25, 1.5, abs(turn))),
            lambda d: 0.05 + 0.025 * smoothstep(-0.3, -0.9, d.z) + 0.012 * curls(d),
            "Hair",
            segs=44,
        )
    if variant == "goatee":
        # A tuft on the chin, tapering to a point.
        tuft = []
        for i in range(32):
            a = 2 * math.pi * i / 32
            below = max(-math.sin(a), 0)
            tuft.append((0.036 * math.cos(a) * (1 - 0.55 * below), 0.712 + 0.03 * math.sin(a) - 0.012 * below**2))
        part.patch(on_face, tuft, 0.018, "Hair", rings=6)
    return part.finish(slot="facialHair", variant=variant)


# --- Body ---------------------------------------------------------------------


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


def build_shoe(side, name):
    """A sneaker, with a collar round the ankle, a toe cap and laces in a trim color."""
    part = Part(f"Shoe_{name}")
    x = side * 0.075
    center, radii = Vector((x, -0.022, 0.05)), Vector((0.063, 0.09, 0.046))
    part.sphere(center, radii, "Shoes")
    part.sphere((x, -0.024, 0.018), (0.067, 0.094, 0.018), "Sole")

    def on_top(px, py, out):
        """The point on top of the shoe over (px, py)."""
        rest = 1 - ((px - center.x) / radii.x) ** 2 - ((py - center.y) / radii.y) ** 2
        return Vector((px, py, center.z + radii.z * math.sqrt(max(rest, 0)) + out))

    def on_front(px, pz):
        rest = 1 - ((px - center.x) / radii.x) ** 2 - ((pz - center.z) / radii.z) ** 2
        point = Vector((px, center.y - radii.y * math.sqrt(max(rest, 0)), pz))
        local = point - center
        return point, Vector((local.x / radii.x**2, local.y / radii.y**2, local.z / radii.z**2)).normalized()

    collar = [
        on_top(x + 0.036 * math.cos(a), 0.006 + 0.032 * math.sin(a), 0.002)
        for a in (2 * math.pi * i / 20 for i in range(20))
    ]
    part.tube(collar, 0.0085, "ShoesTrim", closed=True, sides=8, normal=(0, 0, 1))
    toe = [(x + 0.05 * math.cos(a), 0.041 + 0.022 * math.sin(a)) for a in (2 * math.pi * i / 24 for i in range(24))]
    part.patch(on_front, toe, 0.004, "ShoesTrim", rings=4)
    for py in (-0.042, -0.064):
        lace = [on_top(x + u * 0.022, py, 0.004) for u in (-1, -0.5, 0, 0.5, 1)]
        part.tube(lace, 0.0055, "ShoesTrim", sides=6)
    return part.finish()


# --- Clothes ------------------------------------------------------------------

# How far each top stands out from the body, so overalls fit over each.
TOPS = {"tee": 1.0, "hoodie": 1.06, "sweater": 1.04}


def torso_profile(scale, hem=HEM, body="male"):
    """A body scaled out, down to a hem that rolls under."""
    shape = BODIES[body]
    rings = [(r * scale, z) for r, z in shape if z > hem]
    edge = radius_at(shape, hem) * scale
    return rings + [(edge, hem), (edge * 0.96, hem - 0.008), (edge * 0.75, hem - 0.012), (0.0, hem - 0.012)]


def around_top(scale, z, out, count, body="male"):
    """Points around a top at height z, `out` off it."""
    r = radius_at(BODIES[body], z) * scale
    return [
        Vector((math.sin(a) * (r + out), -math.cos(a) * (r * DEPTH + out), z))
        for a in (2 * math.pi * i / count for i in range(count))
    ]


def rib(part, scale, z, thick, mat, body="male"):
    """A knitted band around a top, at its hem or neck."""
    count = 72
    part.tube(around_top(scale, z, thick * 0.35, count, body), ribbed(count, thick, 18), mat, closed=True, sides=6, normal=(0, 0, 1))


def stripe(part, scale, top, bottom, mat, body="male"):
    """A band of color around a top, standing just proud of it."""
    profile = [
        (radius_at(BODIES[body], z) * scale + out, z)
        for z, out in ((top + 0.003, -0.004), (top, 0.004), (bottom, 0.004), (bottom - 0.003, -0.004))
    ]
    part.lathe(profile, mat, segs=44, depth=DEPTH)


def named(base, body):
    return base if body == "male" else f"{base}_{body}"


def build_tee(body):
    part = Part(named("Top_tee", body))
    part.lathe(torso_profile(TOPS["tee"], body=body), "Top", segs=40, depth=DEPTH)
    # A little pocket on the chest.
    pocket = [(0.072 + x * 0.024, 0.47 + z * 0.026) for x, z in squircle(24, 5)]
    part.patch(lambda x, z: on_torso(TOPS["tee"], x, z, body=body), pocket, 0.005, "TopTrim", rings=4)
    return part.finish((0, 0, 0.43), slot="top", variant="tee", body=body)


def build_hoodie(body):
    scale = TOPS["hoodie"]
    part = Part(named("Top_hoodie", body))
    part.lathe(torso_profile(scale, HEM + 0.008, body), "Top", segs=44, depth=DEPTH)
    rib(part, scale, HEM + 0.002, 0.02, "TopTrim", body)

    def front(x, z):
        return on_torso(scale, x, z, body=body)

    def back(x, z):
        return on_torso(scale, x, z, back=True, body=body)

    # The kangaroo pocket, wider at the bottom, with a seam across its top.
    pocket = [
        (x * 0.105 * lerp(1.0, 0.78, (z + 1) / 2), 0.335 + z * 0.058) for x, z in squircle(40, 5)
    ]
    part.patch(front, pocket, 0.01, "Top")
    seam = []
    for i in range(9):
        x = lerp(-0.075, 0.075, i / 8)
        point, normal = front(x, 0.388)
        seam.append(point + normal * 0.01)
    part.tube(seam, 0.0035, "TopTrim", sides=6)

    # The hood, lying down the back from the neck...
    hood = []
    for i in range(40):
        a = 2 * math.pi * i / 40
        c, s = math.cos(a), math.sin(a)
        hood.append((0.112 * c * (1 - 0.5 * max(-s, 0)), 0.505 + 0.09 * s))
    part.patch(back, hood, 0.042, "Top", rings=7)
    # ...and its rim, around the neck and open at the front.
    rim, radii = [], []
    for i in range(25):
        turn = lerp(0.55, 2 * math.pi - 0.55, i / 24)
        behind = (1 - math.cos(turn)) / 2
        z = lerp(0.58, 0.59, behind)
        thick = lerp(0.02, 0.04, behind)
        r = radius_at(BODIES[body], z) * scale
        out = thick * 0.6
        rim.append(Vector((math.sin(turn) * (r + out), -math.cos(turn) * (r * DEPTH + out), z)))
        radii.append(thick)
    part.tube(rim, radii, "Top", sides=12)

    # Drawstrings, tipped at the ends.
    for side in (1, -1):
        path = []
        for i in range(5):
            t = i / 4
            point, normal = front(side * lerp(0.048, 0.055, t), lerp(0.575, 0.465, t))
            path.append(point + normal * 0.013)
        part.tube(path, 0.0055, "Drawstring", sides=6)
        tip = path[-1]
        part.capsule(tip + Vector((0, 0, 0.004)), tip - Vector((0, 0, 0.018)), 0.0085, "Drawstring", seg=10, rings=7)
    return part.finish((0, 0, 0.43), slot="top", variant="hoodie", body=body)


def build_sweater(body):
    scale = TOPS["sweater"]
    part = Part(named("Top_sweater", body))
    part.lathe(torso_profile(scale, HEM + 0.008, body), "Top", segs=44, depth=DEPTH)
    rib(part, scale, HEM + 0.002, 0.019, "TopTrim", body)
    # A crew neck, and two stripes across the chest.
    rib(part, scale, 0.598, 0.016, "TopTrim", body)
    stripe(part, scale, 0.47, 0.44, "TopAccent", body)
    stripe(part, scale, 0.41, 0.38, "TopAccent", body)
    return part.finish((0, 0, 0.43), slot="top", variant="sweater", body=body)


def build_sleeve(side, name, long):
    """Short sleeves for a T-shirt; long ones, cuffed, for a hoodie or a sweater."""
    variant = "hoodie sweater" if long else "tee"
    part = Part(f"Sleeve_{'long' if long else 'short'}_{name}")
    shoulder, wrist = arm_points(side)
    if not long:
        part.capsule(shoulder, shoulder.lerp(wrist, 0.45), 0.05, "Top")
        return part.finish(shoulder, slot="top", variant=variant)
    part.capsule(shoulder, wrist, 0.047, "Top")
    axis = (wrist - shoulder).normalized()
    count = 32
    cuff = ring_points(wrist - axis * 0.01, axis, 0.045, count)
    part.tube(cuff, ribbed(count, 0.014, 10, 0.15), "TopTrim", closed=True, sides=8, normal=axis)
    return part.finish(shoulder, slot="top", variant=variant)


def build_pelvis():
    part = Part("Pelvis")
    part.sphere((0, 0, 0.255), (0.135, 0.115, 0.07), "Bottom")
    return part.finish(slot="bottom", variant="pants shorts overalls")


def build_legwear(side, name, variant):
    """What covers a leg from the hip down to the shoe."""
    x = side * 0.075
    hip, ankle = Vector((x, 0, 0.25)), Vector((x, 0, 0.08))
    part = Part(f"Leg_{variant}_{name}")
    if variant == "pants":
        part.capsule(hip, ankle, 0.05, "Bottom")
        return part.finish(slot="bottom", variant="pants overalls")
    # Bare from the knee, or the hip, down.
    part.capsule(Vector((x, 0, 0.22)), ankle, 0.04, "Skin")
    if variant == "shorts":
        profile = [(0.0, 0.27), (0.052, 0.27), (0.056, 0.24), (0.06, 0.19), (0.06, 0.172), (0.052, 0.166), (0.0, 0.166)]
        part.lathe(profile, "Bottom", segs=20, base=(x, 0, 0))
    return part.finish(slot="bottom", variant=variant)


def build_skirt():
    part = Part("Skirt")
    profile = [
        (0.0, 0.31),
        (0.14, 0.31),
        (0.15, 0.285),
        (0.163, 0.25),
        (0.182, 0.21),
        (0.2, 0.175),
        (0.212, 0.152),
        (0.205, 0.142),
        (0.17, 0.138),
        (0.0, 0.138),
    ]

    def pleats(turn, z):
        return 1 + 0.035 * math.cos(turn * 14) * smoothstep(0.27, 0.16, z)

    part.lathe(profile, "Bottom", segs=56, depth=0.85, wobble=pleats)
    return part.finish(slot="bottom", variant="skirt")


def build_overalls(top, body):
    """The bib and straps of overalls, shaped over one of the tops."""
    scale = TOPS[top]
    part = Part(named(f"Overalls_{top}", body))

    def front(x, z):
        return on_torso(scale, x, z, body=body)

    bib = [(x * 0.088, 0.352 + z * 0.088) for x, z in squircle(48, 6)]
    part.patch(front, bib, 0.012, "Bottom")
    for side in (1, -1):
        # Up the front, over the shoulder, and down the back to the waist.
        path = [
            on_torso(scale, side * 0.068, z, out=0.012, body=body)[0]
            for z in (0.43, 0.48, 0.53, 0.565, 0.59)
        ]
        path += [
            on_torso(scale, side * 0.062, z, back=True, out=0.012, body=body)[0]
            for z in (0.59, 0.565, 0.53, 0.48, 0.43, 0.38, 0.33, 0.29)
        ]
        part.tube(path, 0.012, "Bottom", sides=8)
        point, normal = on_torso(scale, side * 0.068, 0.428, out=0.022, body=body)
        part.sphere(point, (0.013, 0.006, 0.013), "Gold", rot=facing(normal), seg=14, rings=8)
    return part.finish((0, 0, 0.43), slot="bottom", variant="overalls", top=top, body=body)


# --- Hair ---------------------------------------------------------------------

HAIR_STYLES = ("short", "spiky", "long", "ponytail", "pigtails", "bun", "curly")


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
    "spiky": (
        lambda turn: line_at(turn, 0.46, -0.1, -0.45) + bangs(turn, 0.06, 7),
        lambda d: volume(d, 0.06, 0.03),
    ),
    "long": (
        # Parted to one side.
        lambda turn: line_at(turn, 0.4, -0.35, -0.75)
        + 0.08 * smoothstep(-0.3, 0.3, math.sin(turn)) * smoothstep(0.35, 0.85, math.cos(turn)),
        lambda d: volume(d, 0.06, 0.05),
    ),
    "ponytail": (
        # Pulled back off the face.
        lambda turn: line_at(turn, 0.52, -0.08, -0.4),
        lambda d: volume(d, 0.05, 0.02),
    ),
    "pigtails": (
        lambda turn: line_at(turn, 0.42, -0.1, -0.45) + bangs(turn, 0.045, 10),
        lambda d: volume(d, 0.055, 0.03),
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


def pressed(thick):
    """Hair pressed down toward a hat's brim, so it stays under the hat."""

    def under(d):
        line = line_at(turn_of(d), *HAT_LINE)
        full = thick(d)
        return lerp(full, min(full, UNDER_HAT), smoothstep(line - 0.2, line - 0.02, d.z))

    return under


def lift_of(thick):
    """How far hair stands off the top of the head on average: where perched hats sit."""
    samples = [Vector((0, 0, 1))]
    for rise in (45, 60, 75):
        samples += [toward(2 * math.pi * i / 12, math.radians(rise)) for i in range(12)]
    return sum(thick(d) for d in samples) / len(samples)


def spikes(part, thick):
    """Spikes all over the top and back, swept up and back."""
    rows = ((80, 4, 0.0, 0.15), (58, 7, 0.4, 0.15), (34, 7, 0.9, 0.13))
    sweep = Vector((0, 0.25, 0.3))
    for rise, count, start, length in rows:
        for i in range(count):
            turn = math.pi + (i - (count - 1) / 2) * (2 * math.pi - 2 * start) / max(count, 1)
            if abs(math.cos(turn)) > 0.75 and rise < 70 and math.cos(turn) > 0:
                continue
            d = toward(turn, math.radians(rise))
            base = off_head(d, thick(d) - 0.03)
            size = length * (0.9 + 0.2 * ((i * 7) % 3) / 2)
            part.cone(base, d + sweep, size, 0.07, 0.012, "Hair", sides=8)
    # A couple over the forehead, pointing up and out.
    for side in (1, -1):
        d = toward(side * 0.35, math.radians(62))
        part.cone(off_head(d, thick(d) - 0.03), d + Vector((0, -0.1, 0.5)), 0.12, 0.065, 0.012, "Hair", sides=8)


def ponytail(part):
    d = toward(math.pi, rise_of(-0.05))
    tie = off_head(d, 0.06)
    back = Vector((0, 1, -0.55)).normalized()
    part.tube(ring_points(tie, back, 0.034, 16), 0.013, "HairTie", closed=True, sides=8, normal=back)
    path = [
        off_head(d, 0.0),
        tie,
        tie + Vector((0, 0.045, -0.03)),
        tie + Vector((0, 0.095, -0.12)),
        tie + Vector((0, 0.09, -0.24)),
        tie + Vector((0, 0.05, -0.3)),
    ]
    part.tube(path, [0.045, 0.045, 0.06, 0.07, 0.05, 0.018], "Hair", sides=14)


def pigtails(part):
    for side in (1, -1):
        d = toward(side * math.radians(118), rise_of(0.05))
        tie = off_head(d, 0.065)
        # Splaying out to the side more than back.
        out = Vector((d.x, d.y * 0.5, 0)).normalized()
        part.tube(ring_points(tie, out, 0.034, 16), 0.013, "HairTie", closed=True, sides=8, normal=out)
        down = Vector((0, 0, -1))
        path = [
            off_head(d, 0.0),
            tie,
            tie + out * 0.06 + down * 0.02,
            tie + out * 0.11 + down * 0.08,
            tie + out * 0.12 + down * 0.17,
            tie + out * 0.1 + down * 0.26,
            tie + out * 0.07 + down * 0.32,
        ]
        part.tube(path, [0.042, 0.042, 0.06, 0.07, 0.065, 0.045, 0.018], "Hair", sides=14)


def build_hair(variant, hat):
    name = f"Hair_{variant}{'_hat' if hat else ''}"
    part = Part(name)
    start, thick = HAIR[variant]
    part.cap(start, pressed(thick) if hat else thick, "Hair", end=under_hat if hat else None)

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
    if variant == "spiky" and not hat:
        spikes(part, thick)
    if variant == "ponytail":
        ponytail(part)
    if variant == "pigtails":
        pigtails(part)
    if variant == "bun" and not hat:
        part.sphere((0, 0.1, 1.17), (0.11, 0.1, 0.1), "Hair", seg=24, rings=14)
        band = [
            (math.cos(a) * 0.075, 0.08 + math.sin(a) * 0.07, 1.1)
            for a in (2 * math.pi * i / 16 for i in range(16))
        ]
        part.tube(band, 0.016, "Hair", closed=True, sides=8, normal=(0, 0, 1))
    lift = lift_of(thick)
    if variant == "spiky":
        # Up among the spikes, rather than lost in them.
        lift += 0.07
    return part.finish(HEAD_CENTER, slot="hair", variant=variant, hat=1 if hat else 0, lift=round(lift, 4))


# --- Hats ---------------------------------------------------------------------
#
# Hats either cover the hair, coming down to HAT_LINE over the cut of it made
# for them, or perch on it, built to sit on a bald head and lifted by the app
# to sit on whatever hair is there.


def hat_line(turn):
    return line_at(turn, *HAT_LINE)


def build_beanie():
    part = Part("Hat_beanie")

    def knit(d):
        above = d.z - hat_line(turn_of(d))
        # A folded cuff at the brim, ribbed above it.
        cuff = 0.035 * (1 - smoothstep(0.2, 0.25, above))
        rib_ = 0.006 * math.cos(turn_of(d) * 28) * smoothstep(0.25, 0.32, above)
        return 0.13 + cuff + rib_

    part.cap(hat_line, knit, "Hat", segs=84, rings=18)
    part.sphere((0, 0.02, 1.2), (0.075, 0.075, 0.07), "Hat", seg=20, rings=12)
    return part.finish(HEAD_CENTER, slot="hat", variant="beanie")


def build_cap():
    part = Part("Hat_cap")
    part.cap(hat_line, lambda d: 0.125, "Hat")
    part.sphere((0, 0, 1.17), (0.025, 0.025, 0.012), "Hat", seg=12, rings=8)

    def visor(p):
        # Only the front half, curved down at the sides.
        y = min(p.y, 0.0)
        return Vector((p.x, y, p.z - 0.25 * p.x * p.x))

    tilt = Euler((math.radians(-12), 0, 0)).to_matrix()
    part.sphere((0, -0.275, 0.995), (0.22, 0.22, 0.016), "Hat", rot=tilt, deform=visor, seg=32, rings=10)
    return part.finish(HEAD_CENTER, slot="hat", variant="cap")


def build_chef():
    part = Part("Hat_chef")
    # The band: from the hat line around the head, straight up to the puff,
    # closed over the top.
    bm = part.bm
    sides = 48
    columns = []
    for i in range(sides):
        turn = 2 * math.pi * i / sides
        rise = rise_of(hat_line(turn))
        brim = off_head(toward(turn, rise), 0.12)
        top = Vector((math.sin(turn) * 0.33, -math.cos(turn) * 0.315, 1.14))
        column = [off_head(toward(turn, rise - 0.02), -0.05), off_head(toward(turn, rise), 0.08), brim]
        column += [brim.lerp(top, t) for t in (0.33, 0.66, 1.0)]
        columns.append([bm.verts.new(point) for point in column])
    for i in range(sides):
        a, b = columns[i], columns[(i + 1) % sides]
        for k in range(len(a) - 1):
            bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
    lid = bm.verts.new((0, 0, 1.16))
    for i in range(sides):
        bm.faces.new((columns[i][-1], columns[(i + 1) % sides][-1], lid))
    part._paint([vert for column in columns for vert in column] + [lid], "Hat")
    # The puff: a big soft top and lobes around it, overhanging the band.
    part.sphere((0, 0, 1.25), (0.33, 0.31, 0.15), "Hat", seg=32, rings=14)
    for i in range(7):
        a = 2 * math.pi * i / 7 + 0.3
        part.sphere((math.cos(a) * 0.21, math.sin(a) * 0.2, 1.235), (0.155, 0.155, 0.13), "Hat")
    part.sphere((0, 0, 1.33), (0.19, 0.18, 0.1), "Hat")
    return part.finish(HEAD_CENTER, slot="hat", variant="chef")


def build_crown():
    part = Part("Hat_crown")
    height = 0.72
    z = HEAD_CENTER.z + height * HEAD_RADII.z
    r = HEAD_RADII.x * math.sqrt(1 - height**2) + 0.004
    depth = HEAD_RADII.y / HEAD_RADII.x
    top = z + 0.07
    # A gold band, flaring a little toward the top...
    band = [(r - 0.006, top), (r + 0.022, top), (r + 0.01, z), (r - 0.006, z), (r - 0.006, top)]
    part.lathe(band, "Gold", segs=40, depth=depth)
    for i in range(5):
        turn = 2 * math.pi * i / 5
        out = Vector((math.sin(turn), -math.cos(turn) * depth, 0))
        # ...points around the top with a ball on each...
        base = Vector((out.x * (r + 0.012), out.y * (r + 0.012), top - 0.012))
        axis = (out * 0.25 + Vector((0, 0, 1))).normalized()
        part.cone(base, axis, 0.07, 0.034, 0.01, "Gold", sides=8)
        part.sphere(base + axis * 0.078, (0.016, 0.016, 0.016), "Gold", seg=12, rings=8)
        # ...and a gem under each point.
        gem = Vector((out.x * (r + 0.018), out.y * (r + 0.018), z + 0.034))
        part.sphere(gem, (0.017, 0.008, 0.019), "Gem", rot=facing(out.normalized()), seg=14, rings=8)
    return part.finish(HEAD_CENTER, slot="hat", variant="crown", perch=1)


def build_party():
    part = Part("Hat_party")
    # Tipped forward and to one side, at a jaunty angle.
    axis = Euler((math.radians(10), math.radians(18), 0)).to_matrix() @ Vector((0, 0, 1))
    base = off_head(axis, -0.06)
    length, r0, r1 = 0.3, 0.11, 0.012
    bands = 4
    for k in range(bands):
        h0, h1 = length * k / bands, length * (k + 1) / bands
        profile = [(lerp(r0, r1, h0 / length), h0), (lerp(r0, r1, h1 / length), h1)]
        if k == 0:
            profile.insert(0, (0.0, 0.0))
        part.lathe(profile, "Hat" if k % 2 == 0 else "HatAccent", segs=28, base=base, axis=axis)
    part.sphere(base + axis * length, (0.035, 0.035, 0.035), "HatAccent", seg=16, rings=10)
    return part.finish(HEAD_CENTER, slot="hat", variant="party", perch=1)


def over_top(angle, ahead=-0.12):
    """The direction up over the head, from ear to ear, `angle` degrees from the crown."""
    a = math.radians(angle)
    return Vector((math.sin(a), ahead, math.cos(a))).normalized()


def build_cat_ears():
    part = Part("Hat_catears")
    part.tube([off_head(over_top(lerp(-82, 82, i / 16)), 0.045) for i in range(17)], 0.013, "Hat", sides=8)

    def ear(p):
        # Pinched to a rounded point at the top.
        return Vector((p.x * (1 - 0.75 * max(p.z, 0)), p.y, p.z))

    for side in (1, -1):
        d = over_top(side * 36)
        rot = standing(d + Vector((side * 0.25, 0, 0)))
        at = off_head(d, 0.06)
        part.sphere(at + rot @ Vector((0, 0, 0.055)), (0.06, 0.028, 0.075), "Hat", rot=rot, deform=ear)
        inner = at + rot @ Vector((0, -0.017, 0.05))
        part.sphere(inner, (0.038, 0.012, 0.05), "EarInner", rot=rot, deform=ear, seg=16, rings=10)
    return part.finish(HEAD_CENTER, slot="hat", variant="catears", perch=1)


def build_headphones():
    part = Part("Hat_headphones")
    part.tube([off_head(over_top(lerp(-88, 88, i / 18), -0.05), 0.075) for i in range(19)], 0.021, "Hat", sides=10)
    for side in (1, -1):
        axis = Vector((side, 0, 0))
        center = Vector((side * (HEAD_RADII.x + 0.05), 0, 0.84))
        cup = [(0.0, 0.0), (0.06, 0.0), (0.07, 0.01), (0.072, 0.028), (0.062, 0.042), (0.0, 0.044)]
        part.lathe(cup, "Hat", segs=28, base=center, axis=axis)
        part.tube(ring_points(center, axis, 0.052, 24), 0.02, "Cushion", closed=True, sides=8, normal=axis)
        end = off_head(over_top(side * 88, -0.05), 0.075)
        part.capsule(end, center + axis * 0.02 + Vector((0, 0, 0.055)), 0.018, "Hat")
    return part.finish(HEAD_CENTER, slot="hat", variant="headphones", perch=1)


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


def heart(w, h, count=40):
    points = []
    for i in range(count):
        t = 2 * math.pi * i / count
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        points.append((x / 16 * w, (z + 2.5) / 14.5 * h))
    return points


GLASSES = {
    "round": (round_outline(0.068, 0.064), False),
    "square": (rounded_rect(0.072, 0.056, 0.022), False),
    "shades": (aviator(0.074, 0.058), True),
    "heart": (heart(0.072, 0.066), True),
}


def build_glasses(variant):
    part = Part(f"Glasses_{variant}")
    shape, tinted = GLASSES[variant]
    outer = []
    for side in (1, -1):
        outline = [(side * x, z) for x, z in shape]
        center, yaw, points = lens_frame(side, outline)
        normal = yaw @ Vector((0, -1, 0))
        part.tube(points, 0.0085, "Frame", closed=True, sides=8, normal=normal)
        if tinted:
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


def cheer(t):
    """Jump's arms, thrown up and held, pumping, with a hop or two."""
    def up(pump, hop=0.0):
        return {
            "root": {"loc": (0, 0, hop)},
            "spine": {"rot": (-4, 0, 0)},
            "head": {"rot": (-10, 0, 0)},
            "arm_L": {"rot": (-10, -150 + pump, 0)},
            "arm_R": {"rot": (-10, 150 - pump, 0)},
        }

    crouch = {
        "root": {"scale": (1.08, 1.08, 0.9)},
        "spine": {"rot": (8, 0, 0)},
        "arm_L": {"rot": (25, -20, 0)},
        "arm_R": {"rot": (25, 20, 0)},
    }
    keys = [
        (0, {}),
        (5, crouch),
        (10, up(-8, 0.07)),
        (15, up(12)),
        (20, up(-8, 0.06)),
        (25, up(12)),
        (30, up(-6, 0.05)),
        (36, up(10)),
        (48, {}),
    ]
    return blend([(f / 48, p) for f, p in keys], t)


def drink(t):
    """A sip from a cup, at the coffee machine."""
    cup = {
        "head": {"rot": (-4, 0, 0)},
        "arm_R": {"rot": (-118, 0, 30)},
        "arm_L": {"rot": (0, -4, 0)},
    }
    sip = {
        "spine": {"rot": (-5, 0, 0)},
        "head": {"rot": (-16, 0, 0)},
        "arm_R": {"rot": (-132, 0, 34)},
        "arm_L": {"rot": (0, -6, 0)},
    }
    keys = [(0, {}), (12, cup), (20, sip), (40, sip), (48, cup), (60, {})]
    return blend([(f / 60, p) for f, p in keys], t)


# Sitting, legs out in front: the pelvis rests on a seat this high, and the
# thighs just over it. blender/office.py builds every seat's top to it.
SEAT = 0.19


def seated(t, arms=(-34, 10)):
    """Sat down, breathing, with the arms forward by `arms`: (swing, in)."""
    breath = wave_of(t)
    forward, inward = arms
    return {
        "spine": {"scale": (1 + 0.01 * breath, 1 + 0.01 * breath, 1 + 0.02 * breath)},
        "leg_L": {"rot": (-80, 0, 3)},
        "leg_R": {"rot": (-80, 0, -3)},
        "arm_L": {"rot": (forward, 0, -inward)},
        "arm_R": {"rot": (forward, 0, inward)},
    }


def sit(t):
    pose = seated(t)
    pose["spine"]["rot"] = (-3, 1.5 * wave_of(t, 1, 0.25), 0)
    pose["head"] = {"rot": (2 * wave_of(t, 1, 0.1), 4 * wave_of(t, 1, 0.3), 1.5 * wave_of(t, 1, 0.6))}
    return pose


def typing(t):
    """At a keyboard: hands forward, tapping in turn, eyes on the screen."""
    pose = seated(t, arms=(-62, 12))
    left, right = max(0.0, wave_of(t, 6)), max(0.0, wave_of(t, 6, 0.5))
    pose["arm_L"]["rot"] = (-62 + 6 * left, 0, -12)
    pose["arm_R"]["rot"] = (-62 + 6 * right, 0, 12)
    pose["spine"]["rot"] = (7, 0, 1.5 * wave_of(t))
    pose["head"] = {"rot": (6 + 2 * wave_of(t, 2, 0.2), 5 * wave_of(t, 1, 0.3), 0)}
    return pose


def doze(t):
    """Asleep in the chair: the head droops, slowly, then jerks back up."""
    pose = seated(t, arms=(-22, 6))
    droop = smoothstep(0.0, 0.8, t) if t < 0.8 else 1 - smoothstep(0.8, 0.9, t)
    pose["spine"]["rot"] = (9, 0, 2)
    pose["head"] = {"rot": (8 + 18 * droop, 0, 5 + 4 * droop)}
    return pose


# --- Build --------------------------------------------------------------------


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for item in list(block):
            block.remove(item)


def clear_meshes():
    """Removes every mesh, keeping the rest of the scene."""
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def build():
    clear()
    bpy.context.scene.render.fps = FPS
    rig = build_armature()

    attach(rig, build_head(), "head")
    for variant in EYES:
        for body in BODIES:
            attach(rig, build_eyes(variant, body), "head")
    for variant in MOUTHS:
        attach(rig, build_mouth(variant), "head")
    for variant in CHEEKS:
        attach(rig, build_cheeks(variant), "head")
    for variant in FACIAL_HAIR:
        attach(rig, build_facial_hair(variant), "head")

    attach(rig, build_pelvis(), "hips")
    attach(rig, build_skirt(), "hips")
    for side, name in ((1, "L"), (-1, "R")):
        attach(rig, build_arm(side, name), f"arm_{name}")
        attach(rig, build_shoe(side, name), f"leg_{name}")
        for variant in ("pants", "shorts", "skirt"):
            attach(rig, build_legwear(side, name, variant), f"leg_{name}")
        for long in (False, True):
            attach(rig, build_sleeve(side, name, long), f"arm_{name}")
    for body in BODIES:
        attach(rig, build_tee(body), "spine")
        attach(rig, build_hoodie(body), "spine")
        attach(rig, build_sweater(body), "spine")
        for top in TOPS:
            attach(rig, build_overalls(top, body), "spine")

    for variant in HAIR_STYLES:
        for hat in (False, True):
            attach(rig, build_hair(variant, hat), "head")
    for build_hat in (build_beanie, build_cap, build_chef, build_crown, build_party, build_cat_ears, build_headphones):
        attach(rig, build_hat(), "head")
    for variant in GLASSES:
        attach(rig, build_glasses(variant), "head")

    record(rig, "idle", 72, idle, loop=True)
    record(rig, "walk", 24, stride(swing=30, arms=25, lean=5, bob=0.025, twist=6), loop=True)
    record(rig, "run", 16, stride(swing=45, arms=55, lean=12, bob=0.05, twist=9), loop=True)
    record(rig, "jump", 33, jump, loop=False)
    record(rig, "wave", 48, wave, loop=False)
    record(rig, "dance", 48, dance, loop=True)
    record(rig, "cheer", 48, cheer, loop=False)
    record(rig, "drink", 60, drink, loop=False)
    record(rig, "sit", 72, sit, loop=True)
    record(rig, "type", 48, typing, loop=True)
    record(rig, "doze", 90, doze, loop=True)
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
