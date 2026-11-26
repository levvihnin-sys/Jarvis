import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { PHOTO_MAX_CHARS } from '@ryadom/shared';

/**
 * Выбор фото профиля: квадрат 320px, JPEG. Фото хранится в профиле на устройстве
 * и передаётся людям рядом только по запросу (открытие профиля).
 */
export async function pickProfilePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  for (const [size, compress] of [
    [320, 0.7],
    [240, 0.6],
    [180, 0.5],
  ] as const) {
    const ref = await ImageManipulator.manipulate(asset.uri).resize({ width: size, height: size }).renderAsync();
    const out = await ref.saveAsync({ base64: true, compress, format: SaveFormat.JPEG });
    if (out.base64) {
      const uri = `data:image/jpeg;base64,${out.base64}`;
      if (uri.length <= PHOTO_MAX_CHARS) return uri;
    }
  }
  return null;
}
