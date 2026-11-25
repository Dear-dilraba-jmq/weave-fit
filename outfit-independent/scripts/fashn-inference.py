"""Run all garment passes using one FASHN pipeline instance."""
import sys
from PIL import Image
from fashn_vton import TryOnPipeline

weights, person_path, output, *garments = sys.argv[1:]
pipeline = TryOnPipeline(weights_dir=weights)
with Image.open(person_path) as photo:
    person = photo.convert("RGB")
for category, garment_path in zip(garments[::2], garments[1::2]):
    with Image.open(garment_path) as garment:
        person = pipeline(
            person_image=person,
            garment_image=garment.convert("RGB"),
            category=category,
        ).images[0].convert("RGB")
person.save(output)
