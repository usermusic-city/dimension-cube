import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nono.dimensioncube',
  appName: '维度魔方',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  }
};

export default config;
