import { apiResult } from "./api-client.js";
const enc = encodeURIComponent;
export function createBackendServices() {
    return {
        config: {
            load: () => apiResult("/api/config"),
        },
        pets: {
            list: () => apiResult("/api/pets"),
            create: payload => apiResult("/api/pets", { method: "POST", body: payload }),
            update: (previousName, payload) => apiResult(`/api/pets/${enc(previousName)}`, { method: "PATCH", body: payload }),
            delete: (name, localOnly) => {
                const suffix = localOnly ? "?local_only=true" : "";
                return apiResult(`/api/pets/${enc(name)}${suffix}`, { method: "DELETE" });
            },
            resetImmich: name => apiResult(`/api/pets/${enc(name)}/reset-immich`, { method: "POST" }),
            listImmichPeople: () => apiResult("/api/immich-people"),
            importFromImmich: payload => apiResult("/api/pets/import", { method: "POST", body: payload }),
        },
        refs: {
            list: petName => apiResult(`/api/pets/${enc(petName)}/assets`),
            save: (petName, assets) => apiResult(`/api/pets/${enc(petName)}/assets`, { method: "POST", body: { assets } }),
            remove: (petName, assetId, cropIdx) => {
                const suffix = cropIdx == null ? "" : `?crop_idx=${cropIdx}`;
                return apiResult(`/api/pets/${enc(petName)}/assets/${assetId}${suffix}`, { method: "DELETE" });
            },
            clear: petName => apiResult(`/api/pets/${enc(petName)}/refs`, { method: "DELETE" }),
            assetCrops: assetId => apiResult(`/api/asset/${assetId}/crops`),
        },
        negatives: {
            list: () => apiResult("/api/negatives"),
            add: assetIds => apiResult("/api/negatives", { method: "POST", body: { asset_ids: assetIds } }),
            remove: assetId => apiResult(`/api/negatives/${assetId}`, { method: "DELETE" }),
            clear: () => apiResult("/api/negatives/all", { method: "DELETE" }),
        },
        suggestions: {
            refs: petName => apiResult(`/api/pets/${enc(petName)}/suggestions`),
            borderline: petName => apiResult(`/api/pets/${enc(petName)}/borderline`),
            borderlineProgress: petName => apiResult(`/api/pets/${enc(petName)}/borderline/progress`),
            negatives: () => apiResult("/api/suggestions/negatives"),
            negativesProgress: () => apiResult("/api/suggestions/negatives/progress"),
        },
        scan: {
            result: () => apiResult("/api/scan/result"),
            start: payload => apiResult("/api/scan", { method: "POST", body: payload }),
            stop: () => apiResult("/api/scan/stop", { method: "POST" }),
            review: () => apiResult("/api/scan/review"),
            applyReview: payload => apiResult("/api/scan/review/apply", { method: "POST", body: payload }),
            skip: assetIds => apiResult("/api/skipped", { method: "POST", body: { asset_ids: assetIds } }),
        },
    };
}
