const fs = require('node:fs');

module.exports = ({config}) => {
  const projectId = process.env.EXPO_PROJECT_ID || config.extra?.eas?.projectId;
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE || config.android?.googleServicesFile;

  if (projectId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId))
    throw new Error('EXPO_PROJECT_ID must be the EAS project UUID.');

  if (googleServicesFile && fs.existsSync(googleServicesFile)) {
    const credentials = JSON.parse(fs.readFileSync(googleServicesFile, 'utf8'));
    if (!credentials.client?.some(client =>
      client.client_info?.android_client_info?.package_name === config.android.package))
      throw new Error('The Firebase Android configuration does not match the mtunz package.');
  }

  if (projectId)
    config.extra = {...config.extra, eas: {...config.extra?.eas, projectId}};
  if (googleServicesFile)
    config.android = {...config.android, googleServicesFile};
  return config;
};
