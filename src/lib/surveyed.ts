import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (claimId: string) => `plateful.surveyed.${claimId}`;

export async function wasSurveyed(claimId: string) {
  return (await AsyncStorage.getItem(key(claimId))) === '1';
}

export async function markSurveyed(claimId: string) {
  await AsyncStorage.setItem(key(claimId), '1');
}
