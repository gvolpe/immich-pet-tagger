{
  lib,
  stdenvNoCC,
  makeWrapper,
  python3Packages,
  src,
  version,
}:

let
  pythonEnv = python3Packages.python.withPackages (
    ps: with ps; [
      fastapi
      httpx
      numpy
      open-clip-torch
      pillow
      python-multipart
      requests
      scikit-learn
      ultralytics
      uvicorn
    ]
  );
in
stdenvNoCC.mkDerivation {
  pname = "immich-pet-tagger";
  inherit src version;

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/immich-pet-tagger
    cp -r app $out/share/immich-pet-tagger/
    cp package.json $out/share/immich-pet-tagger/

    makeWrapper ${pythonEnv}/bin/python $out/bin/immich-pet-tagger \
      --add-flags "$out/share/immich-pet-tagger/app/main.py" \
      --set APP_VERSION "${version}" \
      --set PYTHONNOUSERSITE 1

    makeWrapper ${pythonEnv}/bin/python $out/bin/immich-pet-tagger-scan \
      --add-flags "$out/share/immich-pet-tagger/app/scheduled_scan.py" \
      --set APP_VERSION "${version}" \
      --set PYTHONNOUSERSITE 1

    runHook postInstall
  '';

  passthru = {
    inherit pythonEnv;
  };

  meta = {
    description = "Automatic pet tagging sidecar for Immich";
    homepage = "https://github.com/tedornitier/immich-pet-tagger";
    license = lib.licenses.mit;
    mainProgram = "immich-pet-tagger";
    platforms = lib.platforms.linux;
  };
}
