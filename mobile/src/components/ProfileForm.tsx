import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GENDERS, INTERESTS, profileSchema, type Gender, type InterestId, type Profile } from '@ryadom/shared';
import { pickProfilePhoto } from '../lib/photo';
import { AVATAR_COLORS, AVATAR_EMOJI, radius, space, useTheme } from '../theme';
import { Avatar, Body, Button, Chip, Field, Label, Wrap } from './ui';

export function ProfileForm({
  initial,
  submitTitle,
  onSubmit,
}: {
  initial: Profile | null;
  submitTitle: string;
  onSubmit: (p: Profile) => Promise<void> | void;
}) {
  const t = useTheme();
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [age, setAge] = useState(initial?.age ? String(initial.age) : '');
  const [gender, setGender] = useState<Gender | undefined>(initial?.gender);
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [status, setStatus] = useState(initial?.status ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? { emoji: AVATAR_EMOJI[0]!, color: AVATAR_COLORS[0]! });
  const [photo, setPhoto] = useState<string | undefined>(initial?.photo);
  const [interests, setInterests] = useState<InterestId[]>(initial?.interests ?? ['chat']);
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const toggleInterest = (id: InterestId) =>
    setInterests((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= 5 ? list : [...list, id]));

  const submit = async () => {
    const candidate = {
      nickname: nickname.trim(),
      age: age.trim() ? Number(age) : undefined,
      gender,
      bio: bio.trim() || undefined,
      status: status.trim() || undefined,
      avatar,
      photo,
      interests,
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3),
    };
    const r = profileSchema.safeParse(candidate);
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) {
        const key = String(i.path[0] ?? 'form');
        e[key] ??=
          key === 'age'
            ? 'Возраст от 18 до 99'
            : key === 'interests'
              ? 'Выберите от 1 до 5 целей'
              : key === 'nickname'
                ? 'Имя от 1 до 32 символов'
                : key === 'tags'
                  ? 'До 3 тегов по 24 символа'
                  : i.message;
      }
      setErrors(e);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(r.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: space.l, gap: space.s }}>
        <Avatar avatar={avatar} photo={photo} size={96} />
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Button
            kind="secondary"
            title={photo ? 'Другое фото' : 'Добавить фото'}
            onPress={async () => {
              const p = await pickProfilePhoto();
              if (p) setPhoto(p);
            }}
          />
          {photo ? <Button kind="ghost" title="Убрать" onPress={() => setPhoto(undefined)} /> : null}
        </View>
      </View>

      <Label>Аватар без фото</Label>
      <Wrap style={{ marginBottom: space.s }}>
        {AVATAR_EMOJI.map((e) => (
          <Pressable
            key={e}
            accessibilityLabel={`Эмодзи ${e}`}
            onPress={() => setAvatar((a) => ({ ...a, emoji: e }))}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: avatar.emoji === e ? t.chip : 'transparent',
              borderWidth: avatar.emoji === e ? 2 : 0,
              borderColor: t.primary,
            }}
          >
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </Pressable>
        ))}
      </Wrap>
      <Wrap style={{ marginBottom: space.l }}>
        {AVATAR_COLORS.map((c) => (
          <Pressable
            key={c}
            accessibilityLabel={`Цвет ${c}`}
            onPress={() => setAvatar((a) => ({ ...a, color: c }))}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: avatar.color === c ? 3 : 0, borderColor: t.text }}
          />
        ))}
      </Wrap>

      <Field label="Имя или ник" value={nickname} onChangeText={setNickname} maxLength={32} placeholder="Например, Аня" error={errors.nickname} />

      <Label>Зачем вы здесь (до 5)</Label>
      <Wrap style={{ marginBottom: errors.interests ? 4 : space.l }}>
        {INTERESTS.map((i) => (
          <Chip key={i.id} label={`${i.emoji} ${i.label}`} selected={interests.includes(i.id)} onPress={() => toggleInterest(i.id)} />
        ))}
      </Wrap>
      {errors.interests ? <Text style={{ color: t.danger, marginBottom: space.l }}>{errors.interests}</Text> : null}

      <Field
        label="Статус сейчас"
        value={status}
        onChangeText={setStatus}
        maxLength={80}
        placeholder="Сижу у окна, столик 4 · Вагон 7"
        hint="Помогает найти вас на месте. Видно только людям в этой сети."
      />
      <Field label="О себе" value={bio} onChangeText={setBio} maxLength={300} multiline placeholder="Пара слов о себе" />

      <View style={{ flexDirection: 'row', gap: space.m }}>
        <View style={{ flex: 1 }}>
          <Field label="Возраст" value={age} onChangeText={(v) => setAge(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="—" error={errors.age} />
        </View>
        <View style={{ flex: 2 }}>
          <Label>Пол</Label>
          <Wrap>
            {GENDERS.map((g) => (
              <Chip key={g.id} label={g.label} selected={gender === g.id} onPress={() => setGender(gender === g.id ? undefined : g.id)} />
            ))}
          </Wrap>
        </View>
      </View>

      <Field
        label="Теги"
        value={tags}
        onChangeText={setTags}
        placeholder="шахматы, бег, джаз"
        hint="До трёх, через запятую"
        error={errors.tags}
      />

      <View style={{ backgroundColor: t.cardAlt, borderRadius: radius.m, padding: space.m, marginBottom: space.l }}>
        <Body muted>
          🔒 Профиль хранится только на этом телефоне. Пока приложение открыто, его видят люди в той же Wi‑Fi сети.
          Сервер не записывает его на диск.
        </Body>
      </View>

      <Button title={submitTitle} onPress={submit} loading={saving} />
    </View>
  );
}
