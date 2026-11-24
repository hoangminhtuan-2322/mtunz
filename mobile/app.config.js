const fs = require('node:fs');

module.exports = ({config}) => {
  const projectId = process.env.EXPO_PROJECT_ID || config.extra?.eas?.projectId;
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE || config.android?.googleServicesFile;

  if (projectId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId))
    throw new Error('EXPO_PROJECT_ID must be the EAS project UUID.');

  if (googleServicesFile) {
    if (!fs.existsSync(googleServicesFile))
      throw new Error('The Firebase google-services.json file is missing.');
    const credentials = JSON.parse(fs.readFileSync(googleServicesFile, 'utf8'));
    if (!credentials.client?.some(client =>
      client.client_info?.android_client_info?.package_name === config.android.package))
      throw new Error('The Firebase Android configuration does not match the mtunz package.');
  }

  // CI assigns a monotonically increasing versionCode to each signed release.
  // Development and independent previews retain the canonical app.json code.
  const buildCode = process.env.MTUNZ_ANDROID_BUILD_CODE;
  if (buildCode !== undefined) {
    const code = Number(buildCode);
    if (!/^[1-9]\d*$/.test(buildCode) || !Number.isSafeInteger(code) ||
        code < config.android.versionCode || code > 2100000000)
      throw new Error('Invalid signed Android build code.');
    config.android = {...config.android, versionCode: code};
  }

  if (projectId)
    config.extra = {...config.extra, eas: {...config.extra?.eas, projectId}};
  if (googleServicesFile)
    config.android = {...config.android, googleServicesFile};
  return config;
};
