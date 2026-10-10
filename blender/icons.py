"""
Renders the character editor's category icons, and the silhouette it shows
while the character loads, from the parts blender/character.py builds. Writes
WebP images to src/features/character/icons/.

  blender --background --factory-startup --python blender/icons.py
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

# Imported from beside this file, without leaving a __pycache__ there.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as c  # noqa: E402

OUTPUT = c.ROOT / "src" / "features" / "character" / "icons"
SIZE = 128

# Each icon: the parts in it, the colors they take, and where it's seen from
# (degrees around from the front, and up).
ICONS = {
    "face": (
        lambda: [c.build_head(), c.build_eyes("round", "male"), c.build_mouth("smile"), c.build_cheeks("rosy")],
        {"Skin": "#f9c9a7", "Hair": "#7b4a2c"},
        (12, 8),
    ),
    "hair": (
        lambda: [c.build_hair("ponytail", False)],
        {"Hair": "#9c5a2c", "HairTie": "#e5484d"},
        (60, 10),
    ),
    "hat": (
        lambda: [c.build_cap()],
        {"Hat": "#ff7a59"},
        (40, 10),
    ),
    "glasses": (
        lambda: [c.build_glasses("round")],
        {"Frame": "#3a3a40"},
        (6, 4),
    ),
    "top": (
        lambda: [tee()],
        {"Top": "#4f9ee8", "TopTrim": "#3d82c9"},
        (20, 6),
    ),
    "bottom": (
        lambda: [c.build_pelvis()] + [c.build_legwear(side, name, "pants") for side, name in ((1, "L"), (-1, "R"))],
        {"Bottom": "#3d5a80"},
        (25, 8),
    ),
    "shoes": (
        lambda: [c.build_shoe(1, "L")],
        {"Shoes": "#e5484d", "Sole": "#f4f1ea"},
        (75, 12),
    ),
}


def tee():
    """A T-shirt laid out flat, sleeves out, so it reads as one."""
    part = c.Part("Tee")
    part.lathe(c.torso_profile(1.0), "Top", segs=40, depth=c.DEPTH)
    for side in (1, -1):
        part.capsule(Vector((side * 0.12, 0, 0.56)), Vector((side * 0.24, 0, 0.47)), 0.056, "Top")
    pocket = [(0.075 + x * 0.024, 0.47 + z * 0.026) for x, z in c.squircle(24, 5)]
    part.patch(lambda x, z: c.on_torso(1.0, x, z), pocket, 0.005, "TopTrim", rings=4)
    return part.finish()


def color(name, value):
    material = bpy.data.materials.get(name)
    if material:
        material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = c.hex_to_linear(value)


def studio():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 90
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs[0].default_value = (0.85, 0.87, 0.9, 1)
    background.inputs[1].default_value = 0.9
    scene.world = world
    for name, energy, rotation in (("Key", 3.0, (50, 0, -30)), ("Fill", 1.0, (70, 0, 150))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        light.data.energy = energy
        light.data.angle = math.radians(20)
        light.rotation_euler = tuple(math.radians(a) for a in rotation)
        scene.collection.objects.link(light)
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def bounds(objects):
    corners = [o.matrix_world @ Vector(corner) for o in objects for corner in o.bound_box]
    low = Vector(tuple(min(p[i] for p in corners) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in corners) for i in range(3)))
    return low, high


def look_at(camera, target, around, up, distance):
    a, b = math.radians(around), math.radians(up)
    direction = Vector((math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b)))
    camera.location = target + direction * distance
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def render(path, width, height):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def icons(camera):
    camera.data.type = "ORTHO"
    for name, (build, colors, (around, up)) in ICONS.items():
        c.clear_meshes()
        parts = build()
        bpy.context.view_layer.update()
        for material, value in colors.items():
            color(material, value)
        low, high = bounds(parts)
        look_at(camera, (low + high) / 2, around, up, 4)
        camera.data.ortho_scale = max(high - low) * 1.22
        render(OUTPUT / f"{name}.webp", SIZE, SIZE)


def silhouette(camera):
    """The default character as the stage first frames it: only its shape is used."""
    c.clear_meshes()
    for side, name in ((1, "L"), (-1, "R")):
        c.build_arm(side, name)
        c.build_shoe(side, name)
        c.build_legwear(side, name, "pants")
        c.build_sleeve(side, name, False)
    for build in (c.build_head, lambda: c.build_tee("male"), c.build_pelvis):
        build()
    c.build_eyes("round", "male")
    c.build_hair("short", False)
    bpy.context.view_layer.update()
    # Matches where the stage starts in character-stage.tsx: 26 degrees of
    # view, back far enough to fit 1.28 high, 0.16 of floor for its shadow and
    # 0.12 to spare, looking at the middle of that from a little above.
    camera.data.type = "PERSP"
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle_y = math.radians(26)
    height, floor = 1.28, 0.16
    distance = ((height + floor) / 2 + 0.12) / math.tan(math.radians(13))
    middle = (height - floor) / 2
    target = Vector((0, 0, middle))
    camera.location = Vector((0, -distance, middle + distance * 0.12))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    render(OUTPUT / "silhouette.webp", 240, 300)


if __name__ == "__main__":
    c.clear()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    camera = studio()
    icons(camera)
    silhouette(camera)
    print(f"Wrote {OUTPUT}")
