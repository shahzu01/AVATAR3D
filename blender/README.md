# Blender character pipeline

Scripts that build Kael Studio's Blender characters. They run with the Blender Python module (`bpy`, Blender 5.x)
plus numpy, scipy and scikit-image.

## kit/
Head and body kits for the cartoon Creator (`heads.py`, `bodies.py`), baked into `public/creator/kit/`.

## characters/
New realistic characters.

| File | What it does |
|---|---|
| `mh.py` | Loads the MakeHuman base mesh and applies its morph targets (gender, age, muscle, weight, height, proportions, breasts). |
| `recipes.py` | Character recipes: male and female bases, 12 female body shapes, 10 male body types, garments, hair choice. |
| `mhrig.py` | Builds the mesh, MakeHuman skeleton and weights in Blender; garments (bra, shorts) fitted over the body. |
| `musc.py` | Muscle definition: small displacements for pecs, abs, back, arms and legs. |
| `face.py` | Eyelashes and eyebrows as fine strands placed from the eyelid margin. |
| `hair.py`, `hairlib.py` | Hair locks engine and the female/male hairstyle libraries (20 styles, plus beard). |
| `mhpose.py` | Builds a character, poses the arms down and writes a mesh for preview renders. |
| `clay.py`, `join.py`, `merge.py` | Clay preview renders and contact sheets. |
| `sdf.py`, `body.py` | Signed-distance sculpting kit and the anthropomorphic Fox sculpt. |
| `human.py` | Early hand-sculpted human (superseded by the MakeHuman base). |

### MakeHuman data
The human bodies use MakeHuman's base mesh, targets, rig and eyes, released as CC0
(https://static.makehumancommunity.org/mpfb/faq/build_other_chargen.html). Clone
https://github.com/makehumancommunity/makehuman and point `MH_DATA` at `makehuman/data`.

### Examples
```
python3 mhpose.py female out/female.npz          # build + pose
python3 clay.py out/female.npz out/female front,side 900
python3 hairlib.py out/hair all                   # female hairstyles
python3 hairlib.py out/hair all male              # male hairstyles
```
