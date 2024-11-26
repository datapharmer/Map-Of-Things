const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    format: 'es' // Set to 'es' or 'system' 
    ...jestConfig,
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
