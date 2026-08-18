{
  description = "immich-pet-tagger with GPU support";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  nixConfig = {
    extra-substituters = [
      "https://cache.nixos.org"
      "https://gvolpe-nixos.cachix.org"
    ];
    extra-trusted-public-keys = [
      "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      "gvolpe-nixos.cachix.org-1:0MPlBIMwYmrNqoEaYTox15Ds2t1+3R+6Ycj0hZWMcL0="
    ];
  };

  outputs = { nixpkgs, self }:
    let
      system = "x86_64-linux";
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      version = packageJson.version;

      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };

      rocmPkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfree = true;
          rocmSupport = true;
        };
      };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs.rocmPackages; [
          amdsmi
          rocminfo
          rocm-smi
        ];
      };

      nixosModules.default = import ./nix/module.nix { inherit self; };

      packages.${system} = {
        default = pkgs.callPackage ./nix/package.nix {
          inherit version;
          src = self;
        };

        rocm = rocmPkgs.callPackage ./nix/package.nix {
          inherit version;
          src = self;
        };
      };
    };
}
