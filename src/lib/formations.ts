export type FormationType = 
  | '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '3-4-3' 
  | '4-1-4-1' | '5-3-2' | '4-2-4' | '4-3-2-1' | '4-1-2-1-2';

export interface PositionConfig {
  index: number;
  allowedPosition: string;
  style: React.CSSProperties;
}

export interface FormationDef {
  id: FormationType;
  title: string;
  desc: string;
  positions: PositionConfig[];
}

const cx = (left: string, top: string, right?: string, bottom?: string, transform = '-translate-x-1/2') => {
  const style: React.CSSProperties = { position: 'absolute' };
  if (left) style.left = left;
  if (top) style.top = top;
  if (right) style.right = right;
  if (bottom) style.bottom = bottom;
  
  if (transform === '-translate-x-1/2') style.transform = 'translateX(-50%)';
  else if (transform === 'translate-x-1/2') style.transform = 'translateX(50%)';
  
  return style;
};

// GK Her zaman index 0, sabit.
const KL: PositionConfig = { index: 0, allowedPosition: 'KL', style: cx('50%', '', undefined, '2%') };

export const FORMATIONS: FormationDef[] = [
  {
    id: '4-4-2',
    title: '4-4-2',
    desc: 'Klasik ve Dengeli',
    positions: [
      KL,
      { index: 1, allowedPosition: 'SLB', style: cx('15%', '', undefined, '18%') },
      { index: 2, allowedPosition: 'STP', style: cx('38%', '', undefined, '15%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '38%', '15%', 'translate-x-1/2') },
      { index: 4, allowedPosition: 'SĞB', style: cx('', '', '15%', '18%', 'translate-x-1/2') },
      
      { index: 5, allowedPosition: 'SLK', style: cx('15%', '45%') },
      { index: 6, allowedPosition: 'MO', style: cx('38%', '48%') },
      { index: 7, allowedPosition: 'MO', style: cx('', '48%', '38%', undefined, 'translate-x-1/2') },
      { index: 8, allowedPosition: 'SĞK', style: cx('', '45%', '15%', undefined, 'translate-x-1/2') },
      
      { index: 9, allowedPosition: 'SF', style: cx('38%', '18%') },
      { index: 10, allowedPosition: 'SF', style: cx('', '18%', '38%', undefined, 'translate-x-1/2') }
    ]
  },
  {
    id: '4-3-3',
    title: '4-3-3',
    desc: 'Kanat Organizasyonu',
    positions: [
      KL,
      { index: 1, allowedPosition: 'SLB', style: cx('15%', '', undefined, '18%') },
      { index: 2, allowedPosition: 'STP', style: cx('38%', '', undefined, '15%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '38%', '15%', 'translate-x-1/2') },
      { index: 4, allowedPosition: 'SĞB', style: cx('', '', '15%', '18%', 'translate-x-1/2') },
      
      { index: 5, allowedPosition: 'MO', style: cx('25%', '50%') },
      { index: 6, allowedPosition: 'MO', style: cx('50%', '38%') },
      { index: 7, allowedPosition: 'MO', style: cx('', '50%', '25%', undefined, 'translate-x-1/2') },
      
      { index: 8, allowedPosition: 'SLK', style: cx('20%', '22%') },
      { index: 9, allowedPosition: 'SF', style: cx('50%', '12%') },
      { index: 10, allowedPosition: 'SĞK', style: cx('', '22%', '20%', undefined, 'translate-x-1/2') }
    ]
  },
  {
    id: '4-2-3-1',
    title: '4-2-3-1',
    desc: 'Modern Kontrol',
    positions: [
      KL,
      { index: 1, allowedPosition: 'SLB', style: cx('15%', '', undefined, '18%') },
      { index: 2, allowedPosition: 'STP', style: cx('38%', '', undefined, '15%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '38%', '15%', 'translate-x-1/2') },
      { index: 4, allowedPosition: 'SĞB', style: cx('', '', '15%', '18%', 'translate-x-1/2') },
      
      { index: 5, allowedPosition: 'MO', style: cx('35%', '58%') },
      { index: 6, allowedPosition: 'MO', style: cx('', '58%', '35%', undefined, 'translate-x-1/2') },
      
      { index: 7, allowedPosition: 'SLK', style: cx('20%', '35%') },
      { index: 8, allowedPosition: 'MO', style: cx('50%', '35%') },
      { index: 9, allowedPosition: 'SĞK', style: cx('', '35%', '20%', undefined, 'translate-x-1/2') },
      
      { index: 10, allowedPosition: 'SF', style: cx('50%', '12%') }
    ]
  },
  {
    id: '3-5-2',
    title: '3-5-2',
    desc: 'Merkez Gücü',
    positions: [
      KL,
      { index: 1, allowedPosition: 'STP', style: cx('25%', '', undefined, '16%') },
      { index: 2, allowedPosition: 'STP', style: cx('50%', '', undefined, '13%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '25%', '16%', 'translate-x-1/2') },
      
      { index: 4, allowedPosition: 'SLK', style: cx('12%', '45%') },
      { index: 5, allowedPosition: 'MO', style: cx('32%', '52%') },
      { index: 6, allowedPosition: 'MO', style: cx('50%', '58%') },
      { index: 7, allowedPosition: 'MO', style: cx('', '52%', '32%', undefined, 'translate-x-1/2') },
      { index: 8, allowedPosition: 'SĞK', style: cx('', '45%', '12%', undefined, 'translate-x-1/2') },
      
      { index: 9, allowedPosition: 'SF', style: cx('38%', '16%') },
      { index: 10, allowedPosition: 'SF', style: cx('', '16%', '38%', undefined, 'translate-x-1/2') }
    ]
  },
  {
    id: '3-4-3',
    title: '3-4-3',
    desc: 'Tam Hücum',
    positions: [
      KL,
      { index: 1, allowedPosition: 'STP', style: cx('25%', '', undefined, '16%') },
      { index: 2, allowedPosition: 'STP', style: cx('50%', '', undefined, '13%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '25%', '16%', 'translate-x-1/2') },
      
      { index: 4, allowedPosition: 'SLB', style: cx('15%', '48%') },
      { index: 5, allowedPosition: 'MO', style: cx('38%', '52%') },
      { index: 6, allowedPosition: 'MO', style: cx('', '52%', '38%', undefined, 'translate-x-1/2') },
      { index: 7, allowedPosition: 'SĞB', style: cx('', '48%', '15%', undefined, 'translate-x-1/2') },
      
      { index: 8, allowedPosition: 'SLK', style: cx('20%', '20%') },
      { index: 9, allowedPosition: 'SF', style: cx('50%', '12%') },
      { index: 10, allowedPosition: 'SĞK', style: cx('', '20%', '20%', undefined, 'translate-x-1/2') }
    ]
  },
  {
    id: '4-1-4-1',
    title: '4-1-4-1',
    desc: 'Topa Sahip Olma',
    positions: [
      KL,
      { index: 1, allowedPosition: 'SLB', style: cx('15%', '', undefined, '18%') },
      { index: 2, allowedPosition: 'STP', style: cx('38%', '', undefined, '15%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '38%', '15%', 'translate-x-1/2') },
      { index: 4, allowedPosition: 'SĞB', style: cx('', '', '15%', '18%', 'translate-x-1/2') },
      
      { index: 5, allowedPosition: 'MO', style: cx('50%', '60%') },
      
      { index: 6, allowedPosition: 'SLK', style: cx('18%', '40%') },
      { index: 7, allowedPosition: 'MO', style: cx('35%', '42%') },
      { index: 8, allowedPosition: 'MO', style: cx('', '42%', '35%', undefined, 'translate-x-1/2') },
      { index: 9, allowedPosition: 'SĞK', style: cx('', '40%', '18%', undefined, 'translate-x-1/2') },
      
      { index: 10, allowedPosition: 'SF', style: cx('50%', '15%') }
    ]
  },
  {
    id: '5-3-2',
    title: '5-3-2',
    desc: 'Katı Savunma',
    positions: [
      KL,
      { index: 1, allowedPosition: 'SLB', style: cx('10%', '', undefined, '25%') },
      { index: 2, allowedPosition: 'STP', style: cx('30%', '', undefined, '15%') },
      { index: 3, allowedPosition: 'STP', style: cx('50%', '', undefined, '13%') },
      { index: 4, allowedPosition: 'STP', style: cx('', '', '30%', '15%', 'translate-x-1/2') },
      { index: 5, allowedPosition: 'SĞB', style: cx('', '', '10%', '25%', 'translate-x-1/2') },
      
      { index: 6, allowedPosition: 'MO', style: cx('25%', '50%') },
      { index: 7, allowedPosition: 'MO', style: cx('50%', '54%') },
      { index: 8, allowedPosition: 'MO', style: cx('', '50%', '25%', undefined, 'translate-x-1/2') },
      
      { index: 9, allowedPosition: 'SF', style: cx('38%', '18%') },
      { index: 10, allowedPosition: 'SF', style: cx('', '18%', '38%', undefined, 'translate-x-1/2') }
    ]
  },
  {
    id: '4-2-4',
    title: '4-2-4',
    desc: 'Agresif',
    positions: [
      KL,
      { index: 1, allowedPosition: 'SLB', style: cx('15%', '', undefined, '18%') },
      { index: 2, allowedPosition: 'STP', style: cx('38%', '', undefined, '15%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '38%', '15%', 'translate-x-1/2') },
      { index: 4, allowedPosition: 'SĞB', style: cx('', '', '15%', '18%', 'translate-x-1/2') },
      
      { index: 5, allowedPosition: 'MO', style: cx('38%', '50%') },
      { index: 6, allowedPosition: 'MO', style: cx('', '50%', '38%', undefined, 'translate-x-1/2') },
      
      { index: 7, allowedPosition: 'SLK', style: cx('15%', '22%') },
      { index: 8, allowedPosition: 'SF', style: cx('38%', '15%') },
      { index: 9, allowedPosition: 'SF', style: cx('', '15%', '38%', undefined, 'translate-x-1/2') },
      { index: 10, allowedPosition: 'SĞK', style: cx('', '22%', '15%', undefined, 'translate-x-1/2') }
    ]
  },
  {
    id: '4-3-2-1',
    title: '4-3-2-1',
    desc: 'Noel Ağacı',
    positions: [
      KL,
      { index: 1, allowedPosition: 'SLB', style: cx('15%', '', undefined, '18%') },
      { index: 2, allowedPosition: 'STP', style: cx('38%', '', undefined, '15%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '38%', '15%', 'translate-x-1/2') },
      { index: 4, allowedPosition: 'SĞB', style: cx('', '', '15%', '18%', 'translate-x-1/2') },
      
      { index: 5, allowedPosition: 'MO', style: cx('25%', '54%') },
      { index: 6, allowedPosition: 'MO', style: cx('50%', '58%') },
      { index: 7, allowedPosition: 'MO', style: cx('', '54%', '25%', undefined, 'translate-x-1/2') },
      
      { index: 8, allowedPosition: 'SLK', style: cx('35%', '32%') },
      { index: 9, allowedPosition: 'SĞK', style: cx('', '32%', '35%', undefined, 'translate-x-1/2') },
      
      { index: 10, allowedPosition: 'SF', style: cx('50%', '12%') }
    ]
  },
  {
    id: '4-1-2-1-2',
    title: '4-1-2-1-2',
    desc: 'Baklava',
    positions: [
      KL,
      { index: 1, allowedPosition: 'SLB', style: cx('15%', '', undefined, '18%') },
      { index: 2, allowedPosition: 'STP', style: cx('38%', '', undefined, '15%') },
      { index: 3, allowedPosition: 'STP', style: cx('', '', '38%', '15%', 'translate-x-1/2') },
      { index: 4, allowedPosition: 'SĞB', style: cx('', '', '15%', '18%', 'translate-x-1/2') },
      
      { index: 5, allowedPosition: 'MO', style: cx('50%', '60%') },
      { index: 6, allowedPosition: 'SLK', style: cx('20%', '45%') },
      { index: 7, allowedPosition: 'SĞK', style: cx('', '45%', '20%', undefined, 'translate-x-1/2') },
      { index: 8, allowedPosition: 'MO', style: cx('50%', '32%') },
      
      { index: 9, allowedPosition: 'SF', style: cx('38%', '15%') },
      { index: 10, allowedPosition: 'SF', style: cx('', '15%', '38%', undefined, 'translate-x-1/2') }
    ]
  }
];