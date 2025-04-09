/**
 * Dynamically resolves the URL for a static resource by its name.
 *
 * @param {string} resourceName - The name of the static resource.
 * @returns {string} - The resolved URL for the static resource.
 * @throws {Error} If the resource cannot be resolved.
 */
export function resolveStaticResourceUrl(resourceName) {
    try {
        const resourceUrl = require(`@salesforce/resourceUrl/${resourceName}`);
        return resourceUrl;
    } catch (error) {
        throw new Error(
            `Failed to resolve static resource '${resourceName}'. Ensure the resource exists and is uploaded in Salesforce.`
        );
    }
}
