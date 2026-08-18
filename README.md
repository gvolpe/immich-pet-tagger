# immich-pet-tagger

<p align="center">
  <img src="app/static/logo.svg" alt="Immich Pet Tagger logo" width="96" height="96">
</p>

Automatic pet tagging for Immich. Identifies your pets in new photos and tags them as people in Immich, the same way Immich tags human faces, but for cats, dogs, or any visually distinct subject.

Uses CLIP embeddings and a few reference photos you provide. No cloud services, no training required, runs entirely on your own hardware as a native NixOS service alongside Immich.

![immich-pet-tagger](immich-pet-tagger.png)

## Fork Notice

This project started as a fork of [immich-pet-tagger](https://github.com/tedornitier/immich-pet-tagger) (LLM-assisted tool, huge thanks for sharing!), but I've made a lot of changes tailored to my needs. Among others:

- Frontend rewritten in TypeScript.
  + Rewrote the large static JS frontend into TypeScript modules under app/frontend.
  + Generated browser JS modules are committed under app/static.
  + Added selection/review UI support, multi-pet scan tagging, “not my pet” review actions, select/deselect
    all, confirmation dialogs, refresh guard, and centered loading overlay.
  + Added logo and favicon: app/static/logo.svg, app/static/favicon.svg.
- First-class Nix support.
  + systemd timer for automated scans.
  + reproducible ROCm setup.
  + NixOS module for declarative configurations.
- Refactored python backend considerably.
  + Manual UI scans are now review-first by default (to avoid too many wrong tags).
  + Review apply supports tagging selected crops/photos as one or more pets.
  + “Not a pet” has been reframed as “not my pet” / reject samples.
  + Reject samples are now crop-aware, not only whole-asset IDs.
  + Legacy negatives.json string entries remain supported.
  + Classifier now supports score breakdowns, unknown score, runner-up score, and margin metadata.
  + Added NEGATIVE_SAMPLE_LIMIT, FALLBACK_ENABLE, THRESHOLD_FALLBACK, and YOLO_DEVICE support.
  + Added cross-tag protection: reference assets, reject samples, and already-tagged configured pets are
    skipped instead of being tagged as another configured pet.
- Removed all the Docker stuff.
  + This project is only meant to be consumed via the NixOS module.

I don't intend to support this project beyond my needs, so unless you're on NixOS, I would recommend you to try the original project instead :)

## How it works

1. You enroll your pets via a web UI: provide a few reference photos and a short description
2. A logistic regression classifier is trained locally on CLIP embeddings of those references
3. Every hour, new photos are scanned: YOLO detects and crops any animals in the photo, then each crop is embedded with CLIP and classified against your pets
4. Matching pets are tagged in Immich
5. Pets appear in Immich's People section just like humans

## Features

- **Import from Immich**: if Immich already recognizes your pet as a person, import them in one click. The tool picks up to 20 evenly distributed reference photos automatically.
- **Find similar photos**: uses a two-stage search to surface candidates. Your reference photos are used as visual queries against Immich's smart search, and the local classifier re-ranks the results by pet probability. Falls back to text search using your description when no refs exist yet.
- **Find candidates for "not my pets"**: samples random photos from your library, scores them with the classifier, and surfaces the top 60 most likely to confuse it for bulk review.
- **"Not my pet" samples**: mark photos or crops that should not become one of your configured pets, including other animals, look-alikes, and false detections. These train the classifier's reject/unknown class.
- **Cross-tag protection**: reference photos and photos already tagged as one configured pet are not auto-tagged as a different configured pet during scans.
- **Review-first manual scans**: scans started from the UI collect candidate crops instead of immediately tagging Immich. Select the right crops, then mark wrong crops as "not my pet" or tag them as one or more pets.
- **Date ranges**: restrict a pet to photos taken within a specific period (useful for pets that have passed away or were adopted later).
- **Scan controls**: set the scan start date and trigger a scan from the sidebar; the last scan stats are shown live.
- **Manage pets**: rename a pet, remove it from Pet Tagger only (keeps it and its tags in Immich untouched, so you can re-import later), delete it entirely (also removes the person and all its tags from Immich), or reset its Immich tags (untags every photo but keeps your curated reference photos so you can start tagging fresh).

## Requirements

- Immich running and reachable over HTTP (tested with v2.7.5)
- NixOS with flakes enabled
- An Immich API key with the following permissions:

  | Permission | Reason |
  |---|---|
  | `asset.read` | Search results and asset metadata |
  | `asset.view` | Loading thumbnails |
  | `person.create` | Creating a new pet as a person in Immich |
  | `person.read` | Reading existing persons and thumbnails |
  | `person.update` | Renaming a pet |
  | `person.delete` | Deleting a pet |
  | `person.reassign` | Assigning a face to a person |
  | `face.create` | Writing face entries (the actual tagging) |
  | `face.read` | Checking existing faces on an asset |
  | `face.delete` | Removing face entries on ref removal or pet deletion |
  | `tag.create` | Only with `TAG_NAME`: creating the review tag on first use |
  | `tag.asset` | Only with `TAG_NAME`: applying the review tag to tagged photos |

## Setup

This flake exposes a native NixOS module as `nixosModules.default` and packages
the app as `packages.x86_64-linux.default` (CPU) and `packages.x86_64-linux.rocm`
(AMD/ROCm).

```nix
{
  inputs.immich-pet-tagger.url = "github:tedornitier/immich-pet-tagger";

  outputs = { nixpkgs, immich-pet-tagger, ... }: {
    nixosConfigurations.your-host = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        immich-pet-tagger.nixosModules.default
        {
          services.immich-pet-tagger = {
            enable = true;
            immichUrl = "https://media.gvolpe.com";
            apiKeyFile = "/run/secrets/immich-pet-tagger-api-key";

            gpu = {
              enable = true;
              acceleration = "rocm";
              workers = 2;
              rocm.gfxOverride = "11.0.0"; # RX 7800 XT / gfx1101 compatibility
            };

            models = {
              yolo = {
                name = "yolov8s.pt";
                device = "cpu"; # avoids torchvision::nms ROCm kernel issues
              };
              clip = {
                name = "ViT-L-14";
                pretrained = "openai";
              };
            };

            scan = {
              mode = "timer";
              onCalendar = "*-*-* 05..23:30:00";
              timeZone = "Europe/Warsaw";
            };
          };
        }
      ];
    };
  };
}
```

The service binds to `127.0.0.1:2287` by default, stores data and model caches
under `/var/lib/immich-pet-tagger`, and loads the Immich API key via systemd
credentials so it is not placed in the Nix store. With `scan.mode = "timer"`,
the UI stays up continuously while scans are run by
`immich-pet-tagger-scan.timer`; the example above runs hourly from 05:30
through 23:30 in `Europe/Warsaw` and skips a midnight-to-05:00 maintenance
window. If `scan.timeZone` is unset, systemd uses the host's local timezone.

After adding the module configuration, rebuild and inspect the service:

```bash
sudo nixos-rebuild switch --flake .#your-host
systemctl status immich-pet-tagger.service
```

Open the UI at `http://127.0.0.1:2287` unless you changed `services.immich-pet-tagger.host` or `services.immich-pet-tagger.port`.

---

## Development

The main UI is written in TypeScript modules under `app/frontend/`. The
generated browser files in `app/static/` are committed because the Python
service serves static files directly and the Nix package currently keeps the
frontend toolchain out of the runtime/package closure.

After editing the frontend, rebuild the generated JavaScript:

```bash
nix shell --impure --expr 'with import <nixpkgs> {}; typescript' -c tsc -p tsconfig.json
```

To type-check without writing `app/static/app.js`:

```bash
nix shell --impure --expr 'with import <nixpkgs> {}; typescript' -c tsc -p tsconfig.json --noEmit
```

If `tsc` is already on your `PATH`, the same commands are available as
`npm run frontend:build` and `npm run frontend:check`.

---

## Getting started

Getting good results takes a few iterations. Start by adding a pet, building up references, and adding some "not my pet" samples. Run a short test scan, review the results, refine, and repeat until you're satisfied. Then run the full backfill.

### Step 1: Add your pet

**Import from Immich**: use this if Immich already recognizes your pet as a person from its own face detection. This is ideal when the person in Immich contains only photos of that pet, for example if you tagged them manually and are confident the assignments are correct. The tagger does not remove or correct existing Immich face assignments, so any misidentified photos already tagged in Immich will stay tagged. If Immich's recognition was noisy, consider adding your pet manually instead.

1. Click **↓ Import from Immich** in the sidebar
2. Find and click your pet in the grid
3. Enter a short description (e.g. `orange tabby cat`) and an optional date range
4. Click **Import**. Up to 20 reference photos are imported automatically.

**Add manually**: use this if Immich doesn't know your pet yet.

1. Click **+ Add pet**, fill in the name, a short description (e.g. `black labrador dog`), and an optional date range
2. Click **Create**

The description is used by Immich's CLIP model to find the first batch of candidate photos. Keep it short: 2–4 descriptive keywords.

### Step 2: Add reference photos

References are what the classifier learns from. Quality matters more than quantity.

1. Select your pet in the sidebar and click **Find references**
2. Browse the results. They are ranked by visual similarity to your existing refs, or to your description if no refs exist yet.
3. Aim for 20–30 to start; results improve up to around 50. For each photo:
   - **Add to pet**: clear, close-up shot, your pet is the only subject.
   - **Ignore**: blurry, distant, another person or animal visible alongside your pet, or a look-alike that is not yours. Ignored photos won't appear again.
   - **Not my pet**: anything that should not be tagged as one of your configured pets. Other animals, look-alikes, false detections, and ambiguous shots all belong here.

If you already know a specific photo you want to use, click **Add manually** and paste the Immich photo URL or asset ID directly.

### Step 3: Add "not my pet" samples

These teach the classifier what not to tag: empty rooms, other animals of a different species, ambiguous shots with no clear subject. They are also exact exclusions for future scans. Without them, the classifier will tag almost anything.

1. In the **Not my pet** panel (bottom right of the screen), click **Find candidates** to automatically surface more photos that might confuse the classifier
2. Select the relevant ones and click **Not my pet**
3. To add a specific photo directly, click **Add manually** and paste its Immich URL or asset ID


### Step 4: Run a test scan

Start with a recent date so the scan covers fewer photos, making it quicker to review and refine before committing to a full backfill.

1. In the **Scan from** panel at the bottom of the sidebar, set a date 1–2 weeks back
2. Click **Scan** and wait for the results
3. Review the scan candidates. Select correct crops and tag them as one or more pets.
4. Select wrong results and mark them as "not my pet" or ignore them. Ignored photos won't appear in future results.

### Step 5: Iterate

Repeat steps 2–4 a couple of times. Each round of added references and "not my pet" samples improves accuracy. Results typically stabilize after 2–3 iterations.

### Step 6: Run the full backfill

Once you're happy with the accuracy on the test window:

1. Set the scan date to the earliest date you want to tag. A good starting point is the date you got your pet.
2. Click **Scan** to collect review candidates for that range
3. Apply the reviewed pet tags from the UI

After that, automatic scans tag new photos on the configured poll interval or systemd timer schedule. Your pets appear in Immich's **People** section.

---

## NixOS options

Configure runtime behavior through `services.immich-pet-tagger`. The most useful options are:

| Option | Description |
|---|---|
| `immichUrl` | Immich URL used by the service and browser links. |
| `apiKeyFile` | File containing the Immich API key, loaded via systemd credentials. |
| `tagName` | Optional Immich review tag applied to photos touched by the service. Set to `null` to disable. |
| `scan.mode` | `poll`, `timer`, or `manual`. |
| `scan.pollInterval` | Seconds between in-process background scans when `scan.mode = "poll"`. |
| `scan.onCalendar` | systemd `OnCalendar` expression when `scan.mode = "timer"`. |
| `scan.timeZone` | Optional IANA timezone for the systemd timer. |
| `gpu.enable` | Enable GPU-specific setup. |
| `gpu.acceleration` | GPU backend. Currently `rocm`. |
| `gpu.workers` | Parallel YOLO and CLIP inference workers. |
| `gpu.rocm.gfxOverride` | Optional `HSA_OVERRIDE_GFX_VERSION`, useful for RX 7800 XT / gfx1101 systems. |
| `models.yolo.name` | YOLO model name or weights path. |
| `models.yolo.device` | PyTorch device for YOLO detection, e.g. `"cpu"` to avoid ROCm `torchvision::nms` issues while CLIP still uses ROCm. |
| `models.yolo.inputSize` | YOLO input resolution. |
| `models.yolo.confidence` | Minimum YOLO detection confidence. |
| `models.clip.name` | CLIP model architecture. |
| `models.clip.pretrained` | CLIP pretrained weights tag. |
| `classifier.threshold` | Minimum classifier confidence for crop-based matches. |
| `classifier.thresholdFallback` | Minimum classifier confidence for whole-image fallback matches. |
| `classifier.maxNegativeSamples` | Optional cap on "not my pet" samples used for classifier training. `null` means all samples. |
| `fallback.enable` | Whether scans classify the whole image when YOLO finds no animal crop. |

The first time the app needs to detect or classify a photo, it downloads the configured YOLO and CLIP models into `/var/lib/immich-pet-tagger`. After that, they load from disk and no internet connection is needed.

Do not expose the UI to the internet without putting an authenticated reverse proxy in front of it.

## Bigger models (optional)

The default models (`YOLO_MODEL_NAME=yolov8n.pt`, `CLIP_MODEL_NAME=ViT-B-16`/`CLIP_PRETRAINED=openai`) are chosen to run comfortably on CPU, including low-power hardware like a Raspberry Pi. If you have GPU headroom and want to trade resources for accuracy, `YOLO_MODEL_NAME=yolov8s.pt` with `CLIP_MODEL_NAME=ViT-L-14`/`CLIP_PRETRAINED=openai` measured ~40% fewer missed tags and ~13% fewer false positives than the defaults on a real library (see `.claude/decisions.md`). This is opt-in, not the shipped default, for two reasons:

- `ViT-L-14` is roughly 4x the parameters/compute of the default `ViT-B-16`, and needs a larger download (~900MB vs ~350MB) plus more RAM/VRAM per `GPU_WORKERS` thread. That conflicts with the project's CPU-friendly default.
- The accuracy gain was measured on one library with several hundred reference photos per pet. A classifier with very few refs may not benefit as much from the larger embedding space, since there's less data to fit a good decision boundary with.

In my own personal testing I reached 96% tagging accuracy at a 1.4% false-positive rate using this combo (`yolov8s.pt` + `ViT-L-14`/`openai`), versus the defaults.

If you want to try it, use:

```nix
services.immich-pet-tagger = {
  models = {
    yolo = {
      name = "yolov8s.pt";
    };
    clip = {
      name = "ViT-L-14";
      pretrained = "openai";
    };
  };
};
```

Embedding caches are namespaced per model combo, so switching is safe and reversible, it just means a cold cache and re-embedding refs/assets on first use.

## Limitations

- **YOLO fallback**: when no animals are detected by YOLO and `FALLBACK_ENABLE=true`, the full image is classified as a whole and only one pet can be tagged per photo
- **Polling only**: photos are processed on the next automatic or manual scan, not instantly

## Troubleshooting

**Pet not appearing in Immich after enrollment**
Immich only shows people with at least one face assigned. Add at least one reference photo and wait for a poll cycle.

**Low accuracy / wrong pet tagged**
Add more reference photos, add more "not my pet" samples, or raise the relevant threshold in the NixOS module.

**Service can't reach Immich**
Make sure `services.immich-pet-tagger.immichUrl` points at an Immich URL reachable from the NixOS host.

**Thumbnail proxy returns 401**
Your API key is missing `asset.view` permission.
