"""Pre-compute sample bundles by running sample faces through the running app's own API (live YouCam calls).

Usage: python3 -I scripts/build-samples.py http://localhost:3077 <id>=<photo.jpg> [...]
Writes public/samples/<id>/{photo.jpg, mask-*.png, heavy.jpg, step-N.jpg, bundle.json}.
Sample faces are AI-generated (YouCam text-to-image) – no real person.
"""
import base64, json, os, sys, uuid, urllib.request

BASE = sys.argv[1]
ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "samples")
META = {
    "redness": ("Redness-prone", "Flushed cheeks & nose, fair skin"),
    "undereye": ("Dark circles", "Blue-grey under-eye shadow"),
    "spots": ("Blemishes & marks", "Post-acne marks, deep skin"),
}

def post_json(path, body):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=180))

def post_image(path, img_bytes):
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"s.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n").encode() + img_bytes + f"\r\n--{b}--\r\n".encode()
    r = urllib.request.Request(BASE + path, data=body, headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(r, timeout=180))

def save_data_url(du, path):
    open(path, "wb").write(base64.b64decode(du.split(",", 1)[1]))

for arg in sys.argv[2:]:
    sid, photo = arg.split("=", 1)
    out = os.path.join(ROOT, sid)
    os.makedirs(out, exist_ok=True)
    img = open(photo, "rb").read()
    open(os.path.join(out, "photo.jpg"), "wb").write(img)
    a = post_image("/api/analyze", img)
    if "error" in a:
        raise SystemExit(f"{sid}: {a['error']}")
    masks = {}
    for k, du in a["masks"].items():
        save_data_url(du, os.path.join(out, f"mask-{k}.png"))
        masks[k] = f"/samples/{sid}/mask-{k}.png"
    a["masks"] = masks
    a.pop("photo", None)  # the bundle references photo.jpg instead
    plan = a["plan"]
    data_url = "data:image/jpeg;base64," + base64.b64encode(img).decode()
    h = post_json("/api/render", {"image": data_url, "effects": plan["heavyEffects"], "key": f"sample-{sid}-heavy"})
    save_data_url(h["dataUrl"], os.path.join(out, "heavy.jpg"))
    prev, steps = None, []
    for i, s in enumerate(plan["steps"]):
        body = {"effects": s["effects"], "key": f"sample-{sid}-" + json.dumps([x["effects"] for x in plan["steps"][: i + 1]])}
        body.update({"srcUrl": prev} if prev else {"image": data_url})
        r = post_json("/api/render", body)
        prev = r["url"]
        save_data_url(r["dataUrl"], os.path.join(out, f"step-{i}.jpg"))
        steps.append(f"/samples/{sid}/step-{i}.jpg")
        print(sid, "step", i, s["id"], "ok", flush=True)
    label, blurb = META.get(sid, (sid, ""))
    bundle = {"id": sid, "label": label, "blurb": blurb, "photo": f"/samples/{sid}/photo.jpg", "analysis": a,
              "heavy": f"/samples/{sid}/heavy.jpg", "steps": steps}
    json.dump(bundle, open(os.path.join(out, "bundle.json"), "w"))
    print(sid, "done", {k: v for k, v in a["scores"].items()}, plan["profile"]["depth"], plan["profile"]["undertone"])
