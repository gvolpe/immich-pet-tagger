{ self }:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.immich-pet-tagger;

  inherit (lib)
    literalExpression
    mapAttrs
    mkEnableOption
    mkIf
    mkOption
    optional
    optionalAttrs
    types
    ;

  rocmEnabled = cfg.gpu.enable && cfg.gpu.acceleration == "rocm";
  timerEnabled = cfg.scan.mode == "timer";
  pollEnabled = cfg.scan.mode == "poll";
  supplementaryGroups = optional rocmEnabled "render" ++ optional rocmEnabled "video";

  package =
    if cfg.gpu.package != null then
      cfg.gpu.package
    else if rocmEnabled then
      self.packages.${pkgs.stdenv.hostPlatform.system}.rocm
    else
      self.packages.${pkgs.stdenv.hostPlatform.system}.default;

  cacheDir = "${cfg.dataDir}/.cache";
  configDir = "${cfg.dataDir}/.config";
  yoloConfigDir = "${cfg.dataDir}/.ultralytics";
  yoloSettingsDir = "${yoloConfigDir}/Ultralytics";

  prepareWritableDirs = ''
    ${pkgs.coreutils}/bin/mkdir -p \
      "${cfg.dataDir}" \
      "${cacheDir}" \
      "${cacheDir}/huggingface" \
      "${cacheDir}/torch" \
      "${configDir}" \
      "${yoloConfigDir}" \
      "${yoloSettingsDir}"
  '';

  env = {
    BACKGROUND_POLL_ENABLED = if pollEnabled then "true" else "false";
    BIND_HOST = cfg.host;
    BIND_PORT = toString cfg.port;
    DATA_DIR = cfg.dataDir;
    FALLBACK_ENABLE = if cfg.fallback.enable then "true" else "false";
    HF_HOME = "${cacheDir}/huggingface";
    HOME = cfg.dataDir;
    IMMICH_EXTERNAL_URL = cfg.immichUrl;
    IMMICH_URL = cfg.immichUrl;
    LONG_REQUEST_TIMEOUT = toString cfg.longRequestTimeout;
    POLL_INTERVAL = toString cfg.scan.pollInterval;
    TORCH_HOME = "${cacheDir}/torch";
    XDG_CACHE_HOME = cacheDir;
    XDG_CONFIG_HOME = configDir;
    YOLO_CONFIG_DIR = yoloConfigDir;
  }
  // optionalAttrs (cfg.tagName != null) {
    TAG_NAME = cfg.tagName;
  }
  // optionalAttrs (cfg.gpu.workers != null) {
    GPU_WORKERS = toString cfg.gpu.workers;
  }
  // optionalAttrs (cfg.models.yolo.device != null) {
    YOLO_DEVICE = cfg.models.yolo.device;
  }
  // optionalAttrs (cfg.models.yolo.inputSize != null) {
    YOLO_INPUT_SIZE = toString cfg.models.yolo.inputSize;
  }
  // optionalAttrs (cfg.models.yolo.name != null) {
    YOLO_MODEL_NAME = cfg.models.yolo.name;
  }
  // optionalAttrs (cfg.models.clip.name != null) {
    CLIP_MODEL_NAME = cfg.models.clip.name;
  }
  // optionalAttrs (cfg.models.clip.pretrained != null) {
    CLIP_PRETRAINED = cfg.models.clip.pretrained;
  }
  // optionalAttrs (cfg.classifier.threshold != null) {
    THRESHOLD = toString cfg.classifier.threshold;
  }
  // optionalAttrs (cfg.classifier.thresholdFallback != null) {
    THRESHOLD_FALLBACK = toString cfg.classifier.thresholdFallback;
  }
  // optionalAttrs (cfg.models.yolo.confidence != null) {
    YOLO_CONF = toString cfg.models.yolo.confidence;
  }
  // optionalAttrs (cfg.models.yolo.classes != null) {
    YOLO_CLASSES = lib.concatStringsSep "," cfg.models.yolo.classes;
  }
  // optionalAttrs (cfg.classifier.maxNegativeSamples != null) {
    NEGATIVE_SAMPLE_LIMIT = toString cfg.classifier.maxNegativeSamples;
  }
  // optionalAttrs (rocmEnabled && cfg.gpu.rocm.gfxOverride != null) {
    HSA_OVERRIDE_GFX_VERSION = cfg.gpu.rocm.gfxOverride;
  }
  // cfg.environment;
in
{
  options.services.immich-pet-tagger = {
    enable = mkEnableOption "Immich Pet Tagger";

    apiKeyFile = mkOption {
      description = "File containing the Immich API key. The value is loaded with systemd credentials.";
      example = "/run/secrets/immich-pet-tagger-api-key";
      type = types.str;
    };

    classifier = {
      maxNegativeSamples = mkOption {
        default = null;
        description = "Maximum number of negative samples to train on. Null uses all configured negatives.";
        example = 500;
        type = types.nullOr types.ints.positive;
      };
      threshold = mkOption {
        default = null;
        description = "Minimum classifier confidence for crop-based matches.";
        example = 0.8;
        type = types.nullOr types.float;
      };
      thresholdFallback = mkOption {
        default = null;
        description = "Minimum classifier confidence for whole-image fallback matches.";
        example = 0.85;
        type = types.nullOr types.float;
      };
    };

    dataDir = mkOption {
      default = "/var/lib/immich-pet-tagger";
      description = "Writable directory for app state, references, and model caches.";
      type = types.str;
    };

    environment = mkOption {
      default = { };
      description = "Extra environment variables passed to the service.";
      example = {
        CLIP_MODEL_NAME = "ViT-L-14";
        CLIP_PRETRAINED = "openai";
        YOLO_MODEL_NAME = "yolov8s.pt";
      };
      type = types.attrsOf (
        types.oneOf [
          types.str
          types.int
          types.float
          types.bool
          types.path
        ]
      );
    };

    fallback = {
      enable = mkOption {
        default = true;
        description = "Whether scans should classify the whole image when YOLO finds no animal crop.";
        type = types.bool;
      };
    };

    gpu = {
      acceleration = mkOption {
        default = "rocm";
        description = "GPU inference backend to prepare the service for.";
        type = types.enum [ "rocm" ];
      };
      enable = mkEnableOption "GPU acceleration";
      package = mkOption {
        default = null;
        defaultText = literalExpression ''
          if config.services.immich-pet-tagger.gpu.enable
            && config.services.immich-pet-tagger.gpu.acceleration == "rocm"
          then self.packages.''${pkgs.stdenv.hostPlatform.system}.rocm
          else self.packages.''${pkgs.stdenv.hostPlatform.system}.default
        '';
        description = ''
          Package to run. If unset, the module uses the flake's CPU package,
          or the ROCm package when `gpu.enable = true` and
          `gpu.acceleration = "rocm"`.
        '';
        type = types.nullOr types.package;
      };
      rocm.gfxOverride = mkOption {
        default = null;
        description = ''
          Optional `HSA_OVERRIDE_GFX_VERSION` value. RX 7800 XT / gfx1101 systems
          often use `"11.0.0"` when a PyTorch ROCm build lacks native gfx1101 kernels.
        '';
        example = "11.0.0";
        type = types.nullOr types.str;
      };
      workers = mkOption {
        default = null;
        description = "Parallel YOLO and CLIP inference workers. Defaults to the app's own value.";
        example = 2;
        type = types.nullOr types.ints.positive;
      };
    };

    group = mkOption {
      default = "immich-pet-tagger";
      description = "Group account used to run the service.";
      type = types.str;
    };

    host = mkOption {
      default = "127.0.0.1";
      description = "Address for the web UI to bind.";
      type = types.str;
    };

    immichUrl = mkOption {
      description = "Immich URL used by the service and for browser links.";
      example = "https://media.example.com";
      type = types.str;
    };

    longRequestTimeout = mkOption {
      default = 120;
      description = "Uvicorn keep-alive timeout for long UI requests.";
      type = types.ints.positive;
    };

    models = {
      clip = {
        name = mkOption {
          default = null;
          description = "CLIP model architecture. Defaults to the app's own value.";
          example = "ViT-L-14";
          type = types.nullOr types.str;
        };
        pretrained = mkOption {
          default = null;
          description = "CLIP pretrained weights tag. Defaults to the app's own value.";
          example = "openai";
          type = types.nullOr types.str;
        };
      };
      yolo = {
        classes = mkOption {
          default = null;
          description = ''
            YOLO COCO animal classes accepted as candidate pet crops. Defaults
            to all supported animal classes. Set to `[ "cat" ]` when all
            configured pets are cats, so birds, dogs, horses, and other animals
            never enter the pet classifier.
          '';
          example = [ "cat" ];
          type = types.nullOr (types.listOf (types.enum [
            "bird"
            "cat"
            "dog"
            "horse"
            "sheep"
            "cow"
            "elephant"
            "bear"
            "zebra"
            "giraffe"
          ]));
        };
        confidence = mkOption {
          default = null;
          description = "Minimum YOLO detection confidence.";
          example = 0.2;
          type = types.nullOr types.float;
        };
        device = mkOption {
          default = null;
          description = ''
            Optional PyTorch device for YOLO detection. `auto` uses CUDA/ROCm
            when available and CPU otherwise. Set to `"cpu"` if ROCm's
            torchvision build lacks the `torchvision::nms` GPU kernel; CLIP can
            still use ROCm.
          '';
          example = "cpu";
          type = types.nullOr types.str;
        };
        inputSize = mkOption {
          default = null;
          description = "YOLO input resolution. Must be valid for the app, normally a multiple of 32.";
          example = 640;
          type = types.nullOr types.ints.positive;
        };
        name = mkOption {
          default = null;
          description = "YOLO model name or weights path. Defaults to the app's own value.";
          example = "yolov8s.pt";
          type = types.nullOr types.str;
        };
      };
    };

    port = mkOption {
      default = 2287;
      description = "Port for the web UI to bind.";
      type = types.port;
    };

    scan = {
      mode = mkOption {
        default = "poll";
        description = ''
          Automatic background scan scheduling mode. `poll` keeps the app's
          in-process loop and uses `scan.pollInterval`; `timer` disables that loop
          and creates `immich-pet-tagger-scan.timer`; `manual` disables
          automatic scans while leaving the UI's manual scan controls available.
        '';
        type = types.enum [
          "poll"
          "timer"
          "manual"
        ];
      };
      pollInterval = mkOption {
        default = 3600;
        description = "Seconds between background scans when `scan.mode = \"poll\"`.";
        type = types.ints.positive;
      };
      schedule = mkOption {
        default = "hourly";
        description = ''
          systemd `OnCalendar` expression used when `scan.mode = "timer"`.
          A timezone may be included directly in the expression. For example,
          `"*-*-* 05..23:30:00 Europe/Warsaw"` runs hourly at `:30` from 05:30
          through 23:30 in `Europe/Warsaw` and skips the midnight-to-05:00
          maintenance window.
        '';
        example = "*-*-* 05..23:30:00 Europe/Warsaw";
        type = types.str;
      };
      persistent = mkOption {
        default = true;
        description = "Whether the timer should run once after boot if a scheduled scan was missed.";
        type = types.bool;
      };
      randomizedDelaySec = mkOption {
        default = "0";
        description = "Optional systemd timer jitter for scheduled scans.";
        example = "15m";
        type = types.str;
      };
    };

    tagName = mkOption {
      default = "immich-pet-tagger";
      description = "Immich tag applied to photos touched by the service. Set to null to disable.";
      type = types.nullOr types.str;
    };

    user = mkOption {
      default = "immich-pet-tagger";
      description = "User account used to run the service.";
      type = types.str;
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = !rocmEnabled || pkgs.stdenv.hostPlatform.isLinux;
        message = "ROCm acceleration is only supported on Linux.";
      }
    ];

    hardware.graphics.enable = mkIf rocmEnabled true;

    systemd.services.immich-pet-tagger = {
      after = [ "network-online.target" ];
      description = "Immich Pet Tagger";
      environment = mapAttrs (_: value: toString value) env;
      script = ''
        set -eu
        ${prepareWritableDirs}
        export IMMICH_API_KEY="$(tr -d '\n' < "$CREDENTIALS_DIRECTORY/immich-api-key")"
        exec ${package}/bin/immich-pet-tagger
      '';
      serviceConfig = {
        Group = cfg.group;
        LoadCredential = [ "immich-api-key:${cfg.apiKeyFile}" ];
        LockPersonality = true;
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectHome = true;
        ProtectSystem = "strict";
        ReadWritePaths = [ cfg.dataDir ];
        Restart = "on-failure";
        RestartSec = "10s";
        RestrictSUIDSGID = true;
        SupplementaryGroups = supplementaryGroups;
        Type = "simple";
        User = cfg.user;
        WorkingDirectory = cfg.dataDir;
      };
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
    };

    systemd.services.immich-pet-tagger-scan = mkIf timerEnabled {
      after = [ "network-online.target" ];
      description = "Immich Pet Tagger scheduled scan";
      environment = mapAttrs (_: value: toString value) env;
      script = ''
        set -eu
        ${prepareWritableDirs}
        export IMMICH_API_KEY="$(tr -d '\n' < "$CREDENTIALS_DIRECTORY/immich-api-key")"
        exec ${package}/bin/immich-pet-tagger-scan
      '';
      serviceConfig = {
        Group = cfg.group;
        LoadCredential = [ "immich-api-key:${cfg.apiKeyFile}" ];
        LockPersonality = true;
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectHome = true;
        ProtectSystem = "strict";
        ReadWritePaths = [ cfg.dataDir ];
        RestrictSUIDSGID = true;
        SupplementaryGroups = supplementaryGroups;
        Type = "oneshot";
        User = cfg.user;
        WorkingDirectory = cfg.dataDir;
      };
      wants = [ "network-online.target" ];
    };

    systemd.timers.immich-pet-tagger-scan = mkIf timerEnabled {
      description = "Immich Pet Tagger scheduled scan";
      timerConfig = {
        OnCalendar = cfg.scan.schedule;
        Persistent = cfg.scan.persistent;
        RandomizedDelaySec = cfg.scan.randomizedDelaySec;
        Unit = "immich-pet-tagger-scan.service";
      };
      wantedBy = [ "timers.target" ];
    };

    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0750 ${cfg.user} ${cfg.group} - -"
      "d ${cacheDir} 0750 ${cfg.user} ${cfg.group} - -"
      "d ${configDir} 0750 ${cfg.user} ${cfg.group} - -"
      "d ${yoloConfigDir} 0750 ${cfg.user} ${cfg.group} - -"
      "d ${yoloSettingsDir} 0750 ${cfg.user} ${cfg.group} - -"
    ];

    users.groups = {
      ${cfg.group} = { };
    }
    // optionalAttrs (rocmEnabled && cfg.group != "render") {
      render = { };
    }
    // optionalAttrs (rocmEnabled && cfg.group != "video") {
      video = { };
    };

    users.users.${cfg.user} = {
      inherit (cfg) group;
      createHome = true;
      description = "Immich Pet Tagger service user";
      home = cfg.dataDir;
      isSystemUser = true;
    };
  };
}
