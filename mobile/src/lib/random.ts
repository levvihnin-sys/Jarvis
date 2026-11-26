// В Hermes нет crypto.getRandomValues, поэтому tweetnacl получает случайность из expo-crypto.
// Этот модуль импортируется первым в корневом layout.
import * as Crypto from 'expo-crypto';
import { setRandomSource } from '@ryadom/shared';

setRandomSource((n) => Crypto.getRandomValues(new Uint8Array(n)));
