// Recorded Azure answers from plan 88's session 1 (dev, a learner reading a passage of the
// course aloud), trimmed to the fields the alignment reads; `NBestPhonemes` dropped. And the NB
// Uttale variants (e_written + e_spoken, deduplicated) of every word in them, plus «tømmer».
import type { AzureWord } from '../../providers/infrastructure/azure-speech/azure-result.js';
import type { LexiconVariant } from './align-word.js';

/** REST, Granularity Phoneme, miscue on: scores on the word and phoneme themselves. */
export const REST_WORDS: AzureWord[] = [
  {
    Word: 'Nei',
    Offset: 6600000,
    Duration: 4200000,
    AccuracyScore: 100.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 6600000,
        Duration: 1900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 8600000,
        Duration: 2200000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'fokuser',
    Offset: 11100000,
    Duration: 6100000,
    AccuracyScore: 28.0,
    ErrorType: 'Mispronunciation',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 11100000,
        Duration: 1400000,
        AccuracyScore: 83.0,
      },
      {
        Phoneme: '',
        Offset: 12600000,
        Duration: 500000,
        AccuracyScore: 18.0,
      },
      {
        Phoneme: '',
        Offset: 13200000,
        Duration: 700000,
        AccuracyScore: 4.0,
      },
      {
        Phoneme: '',
        Offset: 14000000,
        Duration: 300000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 14400000,
        Duration: 900000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 15400000,
        Duration: 1300000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 16800000,
        Duration: 400000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'på',
    Offset: 17300000,
    Duration: 1600000,
    AccuracyScore: 94.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 17300000,
        Duration: 1000000,
        AccuracyScore: 99.0,
      },
      {
        Phoneme: '',
        Offset: 18400000,
        Duration: 500000,
        AccuracyScore: 80.0,
      },
    ],
  },
  {
    Word: 'det',
    Offset: 19000000,
    Duration: 1900000,
    AccuracyScore: 73.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 19000000,
        Duration: 1100000,
        AccuracyScore: 77.0,
      },
      {
        Phoneme: '',
        Offset: 20200000,
        Duration: 700000,
        AccuracyScore: 44.0,
      },
    ],
  },
  {
    Word: 'som',
    Offset: 21000000,
    Duration: 3300000,
    AccuracyScore: 48.0,
    ErrorType: 'Mispronunciation',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 21000000,
        Duration: 1300000,
        AccuracyScore: 35.0,
      },
      {
        Phoneme: '',
        Offset: 22400000,
        Duration: 900000,
        AccuracyScore: 44.0,
      },
      {
        Phoneme: '',
        Offset: 23400000,
        Duration: 900000,
        AccuracyScore: 36.0,
      },
    ],
  },
  {
    Word: 'er',
    Offset: 24700000,
    Duration: 2700000,
    AccuracyScore: 55.0,
    ErrorType: 'Mispronunciation',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 24700000,
        Duration: 1400000,
        AccuracyScore: 50.0,
      },
      {
        Phoneme: '',
        Offset: 26200000,
        Duration: 1200000,
        AccuracyScore: 40.0,
      },
    ],
  },
  {
    Word: 'relevant',
    Offset: 0,
    Duration: 0,
    AccuracyScore: 0.0,
    ErrorType: 'Omission',
    Phonemes: [],
  },
  {
    Word: 'for',
    Offset: 27500000,
    Duration: 2000000,
    AccuracyScore: 75.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 27500000,
        Duration: 1300000,
        AccuracyScore: 80.0,
      },
      {
        Phoneme: '',
        Offset: 28900000,
        Duration: 300000,
        AccuracyScore: 40.0,
      },
      {
        Phoneme: '',
        Offset: 29300000,
        Duration: 200000,
        AccuracyScore: 40.0,
      },
    ],
  },
  {
    Word: 'jobben',
    Offset: 29600000,
    Duration: 3300000,
    AccuracyScore: 16.0,
    ErrorType: 'Insertion',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 29600000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 29900000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 30200000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 30500000,
        Duration: 900000,
        AccuracyScore: 44.0,
      },
      {
        Phoneme: '',
        Offset: 31500000,
        Duration: 1400000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'for',
    Offset: 34000000,
    Duration: 3100000,
    AccuracyScore: 90.0,
    ErrorType: 'Insertion',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 34000000,
        Duration: 1300000,
        AccuracyScore: 69.0,
      },
      {
        Phoneme: '',
        Offset: 35400000,
        Duration: 500000,
        AccuracyScore: 96.0,
      },
      {
        Phoneme: '',
        Offset: 36000000,
        Duration: 1100000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'denne',
    Offset: 37400000,
    Duration: 4100000,
    AccuracyScore: 88.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 37400000,
        Duration: 1700000,
        AccuracyScore: 67.0,
      },
      {
        Phoneme: '',
        Offset: 39200000,
        Duration: 900000,
        AccuracyScore: 91.0,
      },
      {
        Phoneme: '',
        Offset: 40200000,
        Duration: 400000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 40700000,
        Duration: 800000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'jobben',
    Offset: 41600000,
    Duration: 4300000,
    AccuracyScore: 97.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 41600000,
        Duration: 1100000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 42800000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 43400000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 44400000,
        Duration: 400000,
        AccuracyScore: 96.0,
      },
      {
        Phoneme: '',
        Offset: 44900000,
        Duration: 1000000,
        AccuracyScore: 84.0,
      },
    ],
  },
  {
    Word: 'Bruk',
    Offset: 51600000,
    Duration: 3600000,
    AccuracyScore: 57.0,
    ErrorType: 'Mispronunciation',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 51600000,
        Duration: 1100000,
        AccuracyScore: 10.0,
      },
      {
        Phoneme: '',
        Offset: 52800000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 53800000,
        Duration: 1000000,
        AccuracyScore: 56.0,
      },
      {
        Phoneme: '',
        Offset: 54900000,
        Duration: 300000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'kulepunkter',
    Offset: 55300000,
    Duration: 10600000,
    AccuracyScore: 82.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 55300000,
        Duration: 1200000,
        AccuracyScore: 13.0,
      },
      {
        Phoneme: '',
        Offset: 56600000,
        Duration: 700000,
        AccuracyScore: 17.0,
      },
      {
        Phoneme: '',
        Offset: 57400000,
        Duration: 700000,
        AccuracyScore: 43.0,
      },
      {
        Phoneme: '',
        Offset: 58200000,
        Duration: 1300000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 59600000,
        Duration: 900000,
        AccuracyScore: 91.0,
      },
      {
        Phoneme: '',
        Offset: 60600000,
        Duration: 700000,
        AccuracyScore: 96.0,
      },
      {
        Phoneme: '',
        Offset: 61400000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 62400000,
        Duration: 1100000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 63600000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 64200000,
        Duration: 700000,
        AccuracyScore: 95.0,
      },
      {
        Phoneme: '',
        Offset: 65000000,
        Duration: 900000,
        AccuracyScore: 84.0,
      },
    ],
  },
  {
    Word: 'ikke',
    Offset: 70200000,
    Duration: 5600000,
    AccuracyScore: 98.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 70200000,
        Duration: 1900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 72200000,
        Duration: 1500000,
        AccuracyScore: 99.0,
      },
      {
        Phoneme: '',
        Offset: 73800000,
        Duration: 2000000,
        AccuracyScore: 94.0,
      },
    ],
  },
  {
    Word: 'lange',
    Offset: 76200000,
    Duration: 5700000,
    AccuracyScore: 53.0,
    ErrorType: 'Mispronunciation',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 76200000,
        Duration: 300000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 76600000,
        Duration: 1100000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 77800000,
        Duration: 1100000,
        AccuracyScore: 16.0,
      },
      {
        Phoneme: '',
        Offset: 79000000,
        Duration: 2900000,
        AccuracyScore: 76.0,
      },
    ],
  },
  {
    Word: 'avsnitt',
    Offset: 84000000,
    Duration: 7900000,
    AccuracyScore: 100.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 84000000,
        Duration: 1100000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 85200000,
        Duration: 1100000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 86400000,
        Duration: 1500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 88000000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 89000000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 90000000,
        Duration: 1900000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'Og',
    Offset: 96600000,
    Duration: 3500000,
    AccuracyScore: 100.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 96600000,
        Duration: 3500000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'vær',
    Offset: 100200000,
    Duration: 2500000,
    AccuracyScore: 73.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 100200000,
        Duration: 900000,
        AccuracyScore: 40.0,
      },
      {
        Phoneme: '',
        Offset: 101200000,
        Duration: 300000,
        AccuracyScore: 74.0,
      },
      {
        Phoneme: '',
        Offset: 101600000,
        Duration: 1100000,
        AccuracyScore: 80.0,
      },
    ],
  },
  {
    Word: 'konkret',
    Offset: 102800000,
    Duration: 6700000,
    AccuracyScore: 100.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 102800000,
        Duration: 1500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 104400000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 105000000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 106000000,
        Duration: 700000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 106800000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 107800000,
        Duration: 700000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 108600000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'skriv',
    Offset: 112600000,
    Duration: 4000000,
    AccuracyScore: 100.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 112600000,
        Duration: 1300000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 114000000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 114600000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 115600000,
        Duration: 300000,
        AccuracyScore: 98.0,
      },
      {
        Phoneme: '',
        Offset: 116000000,
        Duration: 600000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'utviklet',
    Offset: 116900000,
    Duration: 5600000,
    AccuracyScore: 75.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 116900000,
        Duration: 900000,
        AccuracyScore: 96.0,
      },
      {
        Phoneme: '',
        Offset: 117900000,
        Duration: 700000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 118700000,
        Duration: 400000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 119200000,
        Duration: 300000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 119600000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 120200000,
        Duration: 700000,
        AccuracyScore: 67.0,
      },
      {
        Phoneme: '',
        Offset: 121000000,
        Duration: 900000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 122000000,
        Duration: 500000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'et',
    Offset: 125200000,
    Duration: 2900000,
    AccuracyScore: 82.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 125200000,
        Duration: 1700000,
        AccuracyScore: 82.0,
      },
      {
        Phoneme: '',
        Offset: 127000000,
        Duration: 1100000,
        AccuracyScore: 68.0,
      },
    ],
  },
  {
    Word: 'API',
    Offset: 128200000,
    Duration: 3500000,
    AccuracyScore: 86.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 128200000,
        Duration: 1100000,
        AccuracyScore: 65.0,
      },
      {
        Phoneme: '',
        Offset: 129400000,
        Duration: 1000000,
        AccuracyScore: 90.0,
      },
      {
        Phoneme: '',
        Offset: 130500000,
        Duration: 1200000,
        AccuracyScore: 91.0,
      },
    ],
  },
  {
    Word: 'som',
    Offset: 131800000,
    Duration: 3800000,
    AccuracyScore: 96.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 131800000,
        Duration: 1500000,
        AccuracyScore: 90.0,
      },
      {
        Phoneme: '',
        Offset: 133400000,
        Duration: 700000,
        AccuracyScore: 99.0,
      },
      {
        Phoneme: '',
        Offset: 134200000,
        Duration: 1400000,
        AccuracyScore: 97.0,
      },
    ],
  },
  {
    Word: 'håndterer',
    Offset: 135900000,
    Duration: 6500000,
    AccuracyScore: 65.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 135900000,
        Duration: 1800000,
        AccuracyScore: 93.0,
      },
      {
        Phoneme: '',
        Offset: 137800000,
        Duration: 900000,
        AccuracyScore: 96.0,
      },
      {
        Phoneme: '',
        Offset: 138800000,
        Duration: 1300000,
        AccuracyScore: 65.0,
      },
      {
        Phoneme: '',
        Offset: 140200000,
        Duration: 1000000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 141300000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 141600000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 141900000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 142200000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'et',
    Offset: 142500000,
    Duration: 5600000,
    AccuracyScore: 25.0,
    ErrorType: 'Insertion',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 142500000,
        Duration: 1600000,
        AccuracyScore: 66.0,
      },
      {
        Phoneme: '',
        Offset: 144200000,
        Duration: 3900000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'det',
    Offset: 148200000,
    Duration: 5500000,
    AccuracyScore: 16.0,
    ErrorType: 'Insertion',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 148200000,
        Duration: 900000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 149200000,
        Duration: 1500000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 150800000,
        Duration: 2900000,
        AccuracyScore: 25.0,
      },
    ],
  },
  {
    Word: 'i',
    Offset: 158400000,
    Duration: 1700000,
    AccuracyScore: 0.0,
    ErrorType: 'Insertion',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 158400000,
        Duration: 1700000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: '10',
    Offset: 160200000,
    Duration: 2300000,
    AccuracyScore: 22.0,
    ErrorType: 'Mispronunciation',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 160200000,
        Duration: 1300000,
        AccuracyScore: 31.0,
      },
      {
        Phoneme: '',
        Offset: 161600000,
        Duration: 900000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'som',
    Offset: 162600000,
    Duration: 2900000,
    AccuracyScore: 0.0,
    ErrorType: 'Insertion',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 162600000,
        Duration: 1600000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 164300000,
        Duration: 400000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 164800000,
        Duration: 700000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: '000',
    Offset: 0,
    Duration: 0,
    AccuracyScore: 0.0,
    ErrorType: 'Omission',
    Phonemes: [],
  },
  {
    Word: 'forespørsler',
    Offset: 166200000,
    Duration: 11100000,
    AccuracyScore: 78.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 166200000,
        Duration: 1700000,
        AccuracyScore: 44.0,
      },
      {
        Phoneme: '',
        Offset: 168000000,
        Duration: 500000,
        AccuracyScore: 78.0,
      },
      {
        Phoneme: '',
        Offset: 168600000,
        Duration: 600000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 169300000,
        Duration: 600000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 170000000,
        Duration: 1300000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 171400000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 172000000,
        Duration: 1900000,
        AccuracyScore: 83.0,
      },
      {
        Phoneme: '',
        Offset: 174000000,
        Duration: 1700000,
        AccuracyScore: 60.0,
      },
      {
        Phoneme: '',
        Offset: 175800000,
        Duration: 600000,
        AccuracyScore: 61.0,
      },
      {
        Phoneme: '',
        Offset: 176500000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 176800000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 177100000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'i',
    Offset: 177400000,
    Duration: 700000,
    AccuracyScore: 50.0,
    ErrorType: 'Mispronunciation',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 177400000,
        Duration: 700000,
        AccuracyScore: 40.0,
      },
    ],
  },
  {
    Word: 'timen',
    Offset: 182800000,
    Duration: 5300000,
    AccuracyScore: 78.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 182800000,
        Duration: 1500000,
        AccuracyScore: 88.0,
      },
      {
        Phoneme: '',
        Offset: 184400000,
        Duration: 1100000,
        AccuracyScore: 67.0,
      },
      {
        Phoneme: '',
        Offset: 185600000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 186600000,
        Duration: 500000,
        AccuracyScore: 68.0,
      },
      {
        Phoneme: '',
        Offset: 187200000,
        Duration: 900000,
        AccuracyScore: 21.0,
      },
    ],
  },
  {
    Word: 'i',
    Offset: 193400000,
    Duration: 1500000,
    AccuracyScore: 85.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 193400000,
        Duration: 1500000,
        AccuracyScore: 80.0,
      },
    ],
  },
  {
    Word: 'stedet',
    Offset: 195000000,
    Duration: 3700000,
    AccuracyScore: 41.0,
    ErrorType: 'Mispronunciation',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 195000000,
        Duration: 1000000,
        AccuracyScore: 90.0,
      },
      {
        Phoneme: '',
        Offset: 196100000,
        Duration: 1400000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 197600000,
        Duration: 500000,
        AccuracyScore: 44.0,
      },
      {
        Phoneme: '',
        Offset: 198200000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
      {
        Phoneme: '',
        Offset: 198500000,
        Duration: 200000,
        AccuracyScore: 0.0,
      },
    ],
  },
  {
    Word: 'for',
    Offset: 198800000,
    Duration: 2300000,
    AccuracyScore: 88.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 198800000,
        Duration: 900000,
        AccuracyScore: 80.0,
      },
      {
        Phoneme: '',
        Offset: 199800000,
        Duration: 300000,
        AccuracyScore: 91.0,
      },
      {
        Phoneme: '',
        Offset: 200200000,
        Duration: 900000,
        AccuracyScore: 86.0,
      },
    ],
  },
  {
    Word: 'bare',
    Offset: 201200000,
    Duration: 3700000,
    AccuracyScore: 100.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 201200000,
        Duration: 600000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 201900000,
        Duration: 800000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 202800000,
        Duration: 1500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 204400000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'jobbet',
    Offset: 205200000,
    Duration: 4500000,
    AccuracyScore: 100.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 205200000,
        Duration: 1900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 207200000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 207800000,
        Duration: 700000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 208600000,
        Duration: 300000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 209000000,
        Duration: 700000,
        AccuracyScore: 100.0,
      },
    ],
  },
  {
    Word: 'med',
    Offset: 209800000,
    Duration: 1900000,
    AccuracyScore: 92.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 209800000,
        Duration: 900000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 210800000,
        Duration: 900000,
        AccuracyScore: 78.0,
      },
    ],
  },
  {
    Word: 'backend-utvikling',
    Offset: 212000000,
    Duration: 10700000,
    AccuracyScore: 80.0,
    ErrorType: 'None',
    Phonemes: [
      {
        Phoneme: '',
        Offset: 212000000,
        Duration: 1100000,
        AccuracyScore: 21.0,
      },
      {
        Phoneme: '',
        Offset: 213200000,
        Duration: 500000,
        AccuracyScore: 32.0,
      },
      {
        Phoneme: '',
        Offset: 213800000,
        Duration: 600000,
        AccuracyScore: 51.0,
      },
      {
        Phoneme: '',
        Offset: 214500000,
        Duration: 1200000,
        AccuracyScore: 88.0,
      },
      {
        Phoneme: '',
        Offset: 215800000,
        Duration: 900000,
        AccuracyScore: 26.0,
      },
      {
        Phoneme: '',
        Offset: 216800000,
        Duration: 300000,
        AccuracyScore: 52.0,
      },
      {
        Phoneme: '',
        Offset: 217200000,
        Duration: 700000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 218000000,
        Duration: 700000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 218800000,
        Duration: 300000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 219200000,
        Duration: 700000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 220000000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 220600000,
        Duration: 500000,
        AccuracyScore: 100.0,
      },
      {
        Phoneme: '',
        Offset: 221200000,
        Duration: 1500000,
        AccuracyScore: 92.0,
      },
    ],
  },
];

/** Speech SDK, continuous, miscue off: scores under `PronunciationAssessment`. */
export const SDK_WORDS: AzureWord[] = [
  {
    Word: 'Nei',
    Offset: 7000000,
    Duration: 3600000,
    PronunciationAssessment: {
      AccuracyScore: 98,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 7000000,
        Duration: 1600000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 8700000,
        Duration: 1900000,
        PronunciationAssessment: {
          AccuracyScore: 94,
        },
      },
    ],
  },
  {
    Word: 'fokuser',
    Offset: 10700000,
    Duration: 5200000,
    PronunciationAssessment: {
      AccuracyScore: 48,
      ErrorType: 'Mispronunciation',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 10700000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 11500000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 60,
        },
      },
      {
        Phoneme: '',
        Offset: 12200000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 71,
        },
      },
      {
        Phoneme: '',
        Offset: 12700000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 13300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 53,
        },
      },
      {
        Phoneme: '',
        Offset: 14100000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 14900000,
        Duration: 1000000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
    ],
  },
  {
    Word: 'på',
    Offset: 16000000,
    Duration: 1200000,
    PronunciationAssessment: {
      AccuracyScore: 95,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 16000000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 16700000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 84,
        },
      },
    ],
  },
  {
    Word: 'det',
    Offset: 17300000,
    Duration: 2000000,
    PronunciationAssessment: {
      AccuracyScore: 91,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 17300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 18100000,
        Duration: 1200000,
        PronunciationAssessment: {
          AccuracyScore: 80,
        },
      },
    ],
  },
  {
    Word: 'som',
    Offset: 19400000,
    Duration: 2600000,
    PronunciationAssessment: {
      AccuracyScore: 62,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 19400000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 40,
        },
      },
      {
        Phoneme: '',
        Offset: 19900000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 40,
        },
      },
      {
        Phoneme: '',
        Offset: 20900000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 66,
        },
      },
    ],
  },
  {
    Word: 'er',
    Offset: 22100000,
    Duration: 3100000,
    PronunciationAssessment: {
      AccuracyScore: 78,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 22100000,
        Duration: 1700000,
        PronunciationAssessment: {
          AccuracyScore: 52,
        },
      },
      {
        Phoneme: '',
        Offset: 23900000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 95,
        },
      },
    ],
  },
  {
    Word: 'relevant',
    Offset: 25500000,
    Duration: 6000000,
    PronunciationAssessment: {
      AccuracyScore: 94,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 25500000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 26900000,
        Duration: 1000000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 28000000,
        Duration: 200000,
        PronunciationAssessment: {
          AccuracyScore: 71,
        },
      },
      {
        Phoneme: '',
        Offset: 28300000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 71,
        },
      },
      {
        Phoneme: '',
        Offset: 29000000,
        Duration: 800000,
        PronunciationAssessment: {
          AccuracyScore: 89,
        },
      },
      {
        Phoneme: '',
        Offset: 29900000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 30500000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 99,
        },
      },
      {
        Phoneme: '',
        Offset: 31100000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 84,
        },
      },
    ],
  },
  {
    Word: 'for',
    Offset: 31600000,
    Duration: 2000000,
    PronunciationAssessment: {
      AccuracyScore: 98,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 31600000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 32100000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 32600000,
        Duration: 1000000,
        PronunciationAssessment: {
          AccuracyScore: 94,
        },
      },
    ],
  },
  {
    Word: 'denne',
    Offset: 33700000,
    Duration: 2900000,
    PronunciationAssessment: {
      AccuracyScore: 96,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 33700000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 97,
        },
      },
      {
        Phoneme: '',
        Offset: 34500000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 90,
        },
      },
      {
        Phoneme: '',
        Offset: 35100000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 88,
        },
      },
      {
        Phoneme: '',
        Offset: 35700000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
    ],
  },
  {
    Word: 'jobben',
    Offset: 36700000,
    Duration: 3900000,
    PronunciationAssessment: {
      AccuracyScore: 100,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 36700000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 37700000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 38300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 39100000,
        Duration: 300000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 39500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
    ],
  },
  {
    Word: 'Bruk',
    Offset: 44500000,
    Duration: 4500000,
    PronunciationAssessment: {
      AccuracyScore: 96,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 44500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 45700000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 46500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 47700000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 79,
        },
      },
    ],
  },
  {
    Word: 'kulepunkter',
    Offset: 49100000,
    Duration: 13500000,
    PronunciationAssessment: {
      AccuracyScore: 60,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 49100000,
        Duration: 1000000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 50200000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 50900000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 52100000,
        Duration: 2100000,
        PronunciationAssessment: {
          AccuracyScore: 39,
        },
      },
      {
        Phoneme: '',
        Offset: 54300000,
        Duration: 2000000,
        PronunciationAssessment: {
          AccuracyScore: 9,
        },
      },
      {
        Phoneme: '',
        Offset: 56400000,
        Duration: 800000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 57300000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 57900000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 59100000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 96,
        },
      },
      {
        Phoneme: '',
        Offset: 59900000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 89,
        },
      },
      {
        Phoneme: '',
        Offset: 61300000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 79,
        },
      },
    ],
  },
  {
    Word: 'ikke',
    Offset: 64300000,
    Duration: 5500000,
    PronunciationAssessment: {
      AccuracyScore: 90,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 64300000,
        Duration: 1900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 66300000,
        Duration: 1700000,
        PronunciationAssessment: {
          AccuracyScore: 99,
        },
      },
      {
        Phoneme: '',
        Offset: 68100000,
        Duration: 1700000,
        PronunciationAssessment: {
          AccuracyScore: 61,
        },
      },
    ],
  },
  {
    Word: 'Og',
    Offset: 69900000,
    Duration: 600000,
    PronunciationAssessment: {
      AccuracyScore: 50,
      ErrorType: 'Mispronunciation',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 69900000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 40,
        },
      },
    ],
  },
  {
    Word: 'lange',
    Offset: 70600000,
    Duration: 5200000,
    PronunciationAssessment: {
      AccuracyScore: 74,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 70600000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 97,
        },
      },
      {
        Phoneme: '',
        Offset: 71300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 65,
        },
      },
      {
        Phoneme: '',
        Offset: 72100000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 45,
        },
      },
      {
        Phoneme: '',
        Offset: 73300000,
        Duration: 2500000,
        PronunciationAssessment: {
          AccuracyScore: 66,
        },
      },
    ],
  },
  {
    Word: 'avsnitt',
    Offset: 79100000,
    Duration: 9300000,
    PronunciationAssessment: {
      AccuracyScore: 89,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 79100000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 98,
        },
      },
      {
        Phoneme: '',
        Offset: 80500000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 81900000,
        Duration: 2400000,
        PronunciationAssessment: {
          AccuracyScore: 92,
        },
      },
      {
        Phoneme: '',
        Offset: 84400000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 84900000,
        Duration: 1500000,
        PronunciationAssessment: {
          AccuracyScore: 57,
        },
      },
      {
        Phoneme: '',
        Offset: 86500000,
        Duration: 1900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
    ],
  },
  {
    Word: 'Og',
    Offset: 91700000,
    Duration: 3500000,
    PronunciationAssessment: {
      AccuracyScore: 98,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 91700000,
        Duration: 3500000,
        PronunciationAssessment: {
          AccuracyScore: 97,
        },
      },
    ],
  },
  {
    Word: 'vær',
    Offset: 95300000,
    Duration: 2300000,
    PronunciationAssessment: {
      AccuracyScore: 52,
      ErrorType: 'Mispronunciation',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 95300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 40,
        },
      },
      {
        Phoneme: '',
        Offset: 96100000,
        Duration: 300000,
        PronunciationAssessment: {
          AccuracyScore: 53,
        },
      },
      {
        Phoneme: '',
        Offset: 96500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 40,
        },
      },
    ],
  },
  {
    Word: 'konkret',
    Offset: 97700000,
    Duration: 6500000,
    PronunciationAssessment: {
      AccuracyScore: 90,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 97700000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 67,
        },
      },
      {
        Phoneme: '',
        Offset: 98700000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 99300000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 100500000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 98,
        },
      },
      {
        Phoneme: '',
        Offset: 101000000,
        Duration: 800000,
        PronunciationAssessment: {
          AccuracyScore: 55,
        },
      },
      {
        Phoneme: '',
        Offset: 101900000,
        Duration: 1000000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 103000000,
        Duration: 1200000,
        PronunciationAssessment: {
          AccuracyScore: 86,
        },
      },
    ],
  },
  {
    Word: 'skriv',
    Offset: 104300000,
    Duration: 4300000,
    PronunciationAssessment: {
      AccuracyScore: 100,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 104300000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 105300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 106100000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 106900000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 107500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
    ],
  },
  {
    Word: 'utviklet',
    Offset: 108900000,
    Duration: 6700000,
    PronunciationAssessment: {
      AccuracyScore: 86,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 108900000,
        Duration: 1500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 110500000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 111100000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 111900000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 97,
        },
      },
      {
        Phoneme: '',
        Offset: 112500000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 113100000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 91,
        },
      },
      {
        Phoneme: '',
        Offset: 114300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 29,
        },
      },
      {
        Phoneme: '',
        Offset: 115100000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 16,
        },
      },
    ],
  },
  {
    Word: 'et',
    Offset: 116900000,
    Duration: 2700000,
    PronunciationAssessment: {
      AccuracyScore: 78,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 116900000,
        Duration: 1500000,
        PronunciationAssessment: {
          AccuracyScore: 85,
        },
      },
      {
        Phoneme: '',
        Offset: 118500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 50,
        },
      },
    ],
  },
  {
    Word: 'API',
    Offset: 119700000,
    Duration: 3500000,
    PronunciationAssessment: {
      AccuracyScore: 78,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 119700000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 40,
        },
      },
      {
        Phoneme: '',
        Offset: 120900000,
        Duration: 1200000,
        PronunciationAssessment: {
          AccuracyScore: 88,
        },
      },
      {
        Phoneme: '',
        Offset: 122200000,
        Duration: 1000000,
        PronunciationAssessment: {
          AccuracyScore: 84,
        },
      },
    ],
  },
  {
    Word: 'som',
    Offset: 123300000,
    Duration: 4300000,
    PronunciationAssessment: {
      AccuracyScore: 78,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 123300000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 73,
        },
      },
      {
        Phoneme: '',
        Offset: 124700000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 73,
        },
      },
      {
        Phoneme: '',
        Offset: 125900000,
        Duration: 1700000,
        PronunciationAssessment: {
          AccuracyScore: 68,
        },
      },
    ],
  },
  {
    Word: 'håndterer',
    Offset: 132700000,
    Duration: 13700000,
    PronunciationAssessment: {
      AccuracyScore: 80,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 132700000,
        Duration: 3500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 136300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 137100000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 138100000,
        Duration: 2100000,
        PronunciationAssessment: {
          AccuracyScore: 67,
        },
      },
      {
        Phoneme: '',
        Offset: 140300000,
        Duration: 300000,
        PronunciationAssessment: {
          AccuracyScore: 23,
        },
      },
      {
        Phoneme: '',
        Offset: 140700000,
        Duration: 200000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 141000000,
        Duration: 3600000,
        PronunciationAssessment: {
          AccuracyScore: 47,
        },
      },
      {
        Phoneme: '',
        Offset: 144700000,
        Duration: 1700000,
        PronunciationAssessment: {
          AccuracyScore: 82,
        },
      },
    ],
  },
  {
    Word: '10',
    Offset: 154500000,
    Duration: 2800000,
    PronunciationAssessment: {
      AccuracyScore: 19,
      ErrorType: 'Mispronunciation',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 154500000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 155300000,
        Duration: 2000000,
        PronunciationAssessment: {
          AccuracyScore: 21,
        },
      },
    ],
  },
  {
    Word: 'fokuser',
    Offset: 157700000,
    Duration: 6400000,
    PronunciationAssessment: {
      AccuracyScore: 73,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 157700000,
        Duration: 200000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 158000000,
        Duration: 200000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 158300000,
        Duration: 200000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 158600000,
        Duration: 1200000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 159900000,
        Duration: 1500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 161500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 51,
        },
      },
      {
        Phoneme: '',
        Offset: 162700000,
        Duration: 1400000,
        PronunciationAssessment: {
          AccuracyScore: 44,
        },
      },
    ],
  },
  {
    Word: 'forespørsler',
    Offset: 166500000,
    Duration: 12200000,
    PronunciationAssessment: {
      AccuracyScore: 85,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 166500000,
        Duration: 1500000,
        PronunciationAssessment: {
          AccuracyScore: 52,
        },
      },
      {
        Phoneme: '',
        Offset: 168100000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 95,
        },
      },
      {
        Phoneme: '',
        Offset: 168900000,
        Duration: 800000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 169800000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 170500000,
        Duration: 1700000,
        PronunciationAssessment: {
          AccuracyScore: 97,
        },
      },
      {
        Phoneme: '',
        Offset: 172300000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 172900000,
        Duration: 1900000,
        PronunciationAssessment: {
          AccuracyScore: 82,
        },
      },
      {
        Phoneme: '',
        Offset: 174900000,
        Duration: 1500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 176500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 92,
        },
      },
      {
        Phoneme: '',
        Offset: 177700000,
        Duration: 300000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 178100000,
        Duration: 200000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 178400000,
        Duration: 300000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
    ],
  },
  {
    Word: 'i',
    Offset: 179100000,
    Duration: 1100000,
    PronunciationAssessment: {
      AccuracyScore: 85,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 179100000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 80,
        },
      },
    ],
  },
  {
    Word: 'timen',
    Offset: 180300000,
    Duration: 5500000,
    PronunciationAssessment: {
      AccuracyScore: 100,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 180300000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 181700000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 182900000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 183900000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 184500000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
    ],
  },
  {
    Word: 'i',
    Offset: 189900000,
    Duration: 1500000,
    PronunciationAssessment: {
      AccuracyScore: 85,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 189900000,
        Duration: 1500000,
        PronunciationAssessment: {
          AccuracyScore: 80,
        },
      },
    ],
  },
  {
    Word: 'stedet',
    Offset: 191500000,
    Duration: 3500000,
    PronunciationAssessment: {
      AccuracyScore: 100,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 191500000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 192100000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 192900000,
        Duration: 300000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 193300000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 194100000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
    ],
  },
  {
    Word: 'for',
    Offset: 195100000,
    Duration: 2500000,
    PronunciationAssessment: {
      AccuracyScore: 93,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 195100000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 196100000,
        Duration: 300000,
        PronunciationAssessment: {
          AccuracyScore: 80,
        },
      },
      {
        Phoneme: '',
        Offset: 196500000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 88,
        },
      },
    ],
  },
  {
    Word: 'bare',
    Offset: 197700000,
    Duration: 3100000,
    PronunciationAssessment: {
      AccuracyScore: 100,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 197700000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 198500000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 199300000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 200000000,
        Duration: 800000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
    ],
  },
  {
    Word: 'jobbet',
    Offset: 200900000,
    Duration: 3900000,
    PronunciationAssessment: {
      AccuracyScore: 100,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 200900000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 202100000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 202700000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 203500000,
        Duration: 300000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 203900000,
        Duration: 900000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
    ],
  },
  {
    Word: 'med',
    Offset: 204900000,
    Duration: 1700000,
    PronunciationAssessment: {
      AccuracyScore: 88,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 204900000,
        Duration: 800000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 205800000,
        Duration: 800000,
        PronunciationAssessment: {
          AccuracyScore: 68,
        },
      },
    ],
  },
  {
    Word: 'backend-utvikling',
    Offset: 206700000,
    Duration: 12700000,
    PronunciationAssessment: {
      AccuracyScore: 74,
      ErrorType: 'None',
    },
    Phonemes: [
      {
        Phoneme: '',
        Offset: 206700000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 84,
        },
      },
      {
        Phoneme: '',
        Offset: 208100000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 209300000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 210500000,
        Duration: 1300000,
        PronunciationAssessment: {
          AccuracyScore: 69,
        },
      },
      {
        Phoneme: '',
        Offset: 211900000,
        Duration: 1600000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 213600000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 32,
        },
      },
      {
        Phoneme: '',
        Offset: 214100000,
        Duration: 700000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 214900000,
        Duration: 800000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 215800000,
        Duration: 400000,
        PronunciationAssessment: {
          AccuracyScore: 44,
        },
      },
      {
        Phoneme: '',
        Offset: 216300000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 0,
        },
      },
      {
        Phoneme: '',
        Offset: 217000000,
        Duration: 600000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 217700000,
        Duration: 500000,
        PronunciationAssessment: {
          AccuracyScore: 100,
        },
      },
      {
        Phoneme: '',
        Offset: 218300000,
        Duration: 1100000,
        PronunciationAssessment: {
          AccuracyScore: 36,
        },
      },
    ],
  },
];

export const LEXICON: Record<string, LexiconVariant[]> = {
  avsnitt: [
    {
      nofabet: 'AA2 V S N IH3 T',
      pos: 'NN',
    },
  ],
  bare: [
    {
      nofabet: 'B AA2 R AX0',
      pos: 'AB',
    },
    {
      nofabet: 'B AA2 R AX0',
      pos: 'JJ',
    },
    {
      nofabet: 'B AA2 R AX0',
      pos: 'VB',
    },
  ],
  bruk: [
    {
      nofabet: 'B R UU1 K',
      pos: 'NN',
    },
    {
      nofabet: 'B R UU1 K',
      pos: 'VB',
    },
  ],
  denne: [
    {
      nofabet: 'D EH2 N AX0',
      pos: 'PN',
    },
  ],
  det: [
    {
      nofabet: 'D AX0',
      pos: 'PN',
    },
    {
      nofabet: 'D EE1',
      pos: 'PN',
    },
  ],
  er: [
    {
      nofabet: 'EE1 AX0 R',
      pos: 'NN',
    },
    {
      nofabet: 'AE1 R',
      pos: 'VB',
    },
    {
      nofabet: 'AX0 R',
      pos: 'VB',
    },
  ],
  et: [
    {
      nofabet: 'AX0 T',
      pos: 'DT',
    },
    {
      nofabet: 'EH1 T',
      pos: 'DT',
    },
    {
      nofabet: 'EE1 T',
      pos: 'VB',
    },
  ],
  fokuser: [
    {
      nofabet: 'F OO1 K UH0 S AX0 R',
      pos: 'NN',
    },
    {
      nofabet: 'F OH0 K UH0 S EE1 R',
      pos: 'VB',
    },
  ],
  for: [
    {
      nofabet: 'F OAH1 R',
      pos: 'KN',
    },
    {
      nofabet: 'F OO1 R',
      pos: 'NN',
    },
    {
      nofabet: 'F OO1 R',
      pos: 'VB',
    },
  ],
  forespørsler: [
    {
      nofabet: 'F OA2 R AX0 S P OEH3 RS L AX0 R',
      pos: 'NN',
    },
  ],
  håndterer: [
    {
      nofabet: 'H OAH0 N T EE1 R AX0 R',
      pos: 'VB',
    },
  ],
  i: [
    {
      nofabet: 'II1',
      pos: 'NN',
    },
    {
      nofabet: 'IH0',
      pos: 'PP',
    },
    {
      nofabet: 'II1',
      pos: 'PP',
    },
  ],
  ikke: [
    {
      nofabet: 'IH2 K AX0',
      pos: 'AB',
    },
    {
      nofabet: 'IH2 K AX0',
      pos: 'NN',
    },
  ],
  jobben: [
    {
      nofabet: 'J OAH1 B AX0 N',
      pos: 'NN',
    },
  ],
  jobbet: [
    {
      nofabet: 'J OAH2 B AX0 T',
      pos: 'VB',
    },
  ],
  konkret: [
    {
      nofabet: 'K OAH0 NG K R EE1 T',
      pos: 'JJ',
    },
    {
      nofabet: 'K OAH0 NG K R EE1 T',
      pos: 'NN',
    },
  ],
  lange: [
    {
      nofabet: 'L AH2 NG AX0',
      pos: 'PM|person|SUR',
    },
    {
      nofabet: 'L AH2 NG AX0',
      pos: 'JJ',
    },
    {
      nofabet: 'L AH2 NG AX0',
      pos: 'NN',
    },
    {
      nofabet: 'L AH2 NG AX0',
      pos: 'VB',
    },
  ],
  med: [
    {
      nofabet: 'M EE1',
      pos: 'NN',
    },
    {
      nofabet: 'M AX0',
      pos: 'PP',
    },
    {
      nofabet: 'M EE1',
      pos: 'PP',
    },
  ],
  nei: [
    {
      nofabet: 'N AEJ1',
      pos: 'IN',
    },
    {
      nofabet: 'N AEJ1',
      pos: 'NN',
    },
    {
      nofabet: 'N AEJ1',
      pos: 'VB',
    },
  ],
  og: [
    {
      nofabet: 'OA1',
      pos: 'IN',
    },
    {
      nofabet: 'OA1 G',
      pos: 'IN',
    },
  ],
  på: [
    {
      nofabet: 'P OA1',
      pos: 'PP',
    },
    {
      nofabet: 'P OAH1',
      pos: 'PP',
    },
  ],
  relevant: [
    {
      nofabet: 'R AX0 L AX0 V AH1 N T',
      pos: 'JJ',
    },
  ],
  skriv: [
    {
      nofabet: 'S K R II1 V',
      pos: 'NN',
    },
    {
      nofabet: 'S K R II1 V',
      pos: 'VB',
    },
  ],
  som: [
    {
      nofabet: 'S OAH1 M',
      pos: 'PN',
    },
  ],
  stedet: [
    {
      nofabet: 'S T EE1 D AX0',
      pos: 'NN',
    },
  ],
  timen: [
    {
      nofabet: 'T II2 M AX0 N',
      pos: 'NN',
    },
  ],
  tømmer: [
    {
      nofabet: 'T OEH2 M AX0 R',
      pos: 'NN',
    },
    {
      nofabet: 'T OEH1 M AX0 R',
      pos: 'NN',
    },
    {
      nofabet: 'T OEH2 M AX0 R',
      pos: 'VB',
    },
  ],
  utviklet: [
    {
      nofabet: 'UU1 T V IH3 K L AX0 T',
      pos: 'JJ',
    },
    {
      nofabet: 'UU1 T V IH3 K L AX0 T',
      pos: 'VB',
    },
  ],
  vær: [
    {
      nofabet: 'V AE1 R',
      pos: 'NN',
    },
    {
      nofabet: 'V AE1 R',
      pos: 'VB',
    },
  ],
};
