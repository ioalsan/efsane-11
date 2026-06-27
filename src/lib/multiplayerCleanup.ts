interface MutableStorage {
  length: number;
  key: (index: number) => string | null;
  removeItem: (key: string) => void;
}

const removablePrefixes = [
  'canli11:draft:',
  'canli11:autoContinue:',
  'canli11:matchSpeed:',
  'canli11:autoSeason:',
];

const removableExactKeys = new Set([
  'canli11:multiplayer-leagues:v1',
  'canli11:multiplayer-migration-notice:v1',
]);

export const isCanli11MultiplayerStorageKey = (key: string) => (
  removableExactKeys.has(key) || removablePrefixes.some((prefix) => key.startsWith(prefix))
);

export const clearCanli11MultiplayerStorage = (storage: MutableStorage) => {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key && isCanli11MultiplayerStorageKey(key)));
  keys.forEach((key) => storage.removeItem(key));
  return keys;
};

