export interface Settings {
  azureOpenAIApiDeployments?: Array<{
    deploymentName: string;
    instanceName: string;
    apiKey: string;
    apiVersion: string;
    isEnabled: boolean;
  }>;
  // ...other settings
}
