#!/bin/sh
# 끼룩이 asset pipeline: sculpt -> bake normals/AO -> validate -> pack for the game.
set -e
cd "$(dirname "$0")"
CLI=/home/ubuntu/hybrid-voxel-sprite/skills/hybrid-voxel-sprite/scripts/svox_cli.py
rm -rf svox
python3 sculpt.py
python3 "$CLI" bake-normal-ao --bundle svox | tail -n 20
python3 "$CLI" validate --bundle svox --output svox/validate.json
python3 pack.py
