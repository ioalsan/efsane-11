import { Player } from '@/types';

export interface CaptainRole {
  title: string;
  bonus: number;
  description: string;
}

export const getCaptainRole = (player: Player | null | undefined): CaptainRole | null => {
  if (!player) return null;

  if (player.position === 'KL') {
    return {
      title: 'Son Kale',
      bonus: 1,
      description: 'Kaleden gelen liderlik savunma direncini yukari ceker.',
    };
  }

  if (['STP', 'SLB', 'SĞB'].includes(player.position)) {
    return {
      title: 'Duvar Lider',
      bonus: 1,
      description: 'Takim geride daha sakin kalir, zor maclarda kolay dagilmaz.',
    };
  }

  if (['MO', 'OOS'].includes(player.position)) {
    return {
      title: 'Maestro',
      bonus: 2,
      description: 'Oyunun ritmini belirler, kilit pas ve duran top etkisi verir.',
    };
  }

  return {
    title: 'Bitirici Kaptan',
    bonus: 2,
    description: 'Final anlarinda gol ihtimalini ve hucum cesaretini artirir.',
  };
};

export const getCaptainBonus = (player: Player | null | undefined): number => {
  return getCaptainRole(player)?.bonus ?? 0;
};
