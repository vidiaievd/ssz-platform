// The articulation base of the `sound` atoms (plan 86, step 9.1) — data of seed-sound-atoms.ts.
//
// What a learner reads on the card of a sound, and what ai-service's explanation agents
// quote (step 9.2): per interface locale a description (what the sound is and how it is
// spelled), how to say it, the common error, an optional Ukrainian note and a drill.
//
// `commonError` is written for speakers of Russian and Ukrainian in every locale — they make
// nearly the same mistakes in Norwegian (plan 86 §4y.1, Q18) — and `ukNote` says where
// Ukrainian differs; `null` = it does not. Everything describes østnorsk, the variety
// ai-service measures against (NB Uttale). Carrier words are common words that hold the
// sound in a stressed syllable; for `vowel_length` and `tone` they come in pairs.
//
// Not yet reviewed by a native speaker — the phonetics follow the inventory notes in
// ai-service (`nb-sounds.data.ts`) and plan 88 §0.

import type { SoundAtomLocale } from './sound-atoms.js';

export interface SoundAtomBaseText {
  description: string;
  howTo: string;
  commonError: string;
  ukNote: string | null;
  drill: string;
}

export interface SoundAtomBase {
  carrierWords: string[];
  texts: Record<SoundAtomLocale, SoundAtomBaseText>;
}

/** Keyed by `soundAtomKey(language, family)`. */
export const SOUND_ATOM_BASE: Readonly<Record<string, SoundAtomBase>> = {
  'nb:kj': {
    carrierWords: ['kjøkken', 'kino', 'kirke', 'kjøre', 'tjue', 'kyss'],
    texts: {
      en: {
        description:
          'A soft hiss made in the middle of the mouth, like the «ch» in German «ich». Written kj, tj, and k before i, y, ei, øy: «kjøkken», «tjue», «kino», «kyss».',
        howTo:
          'Raise the middle of your tongue close to the hard palate, keep the tip down behind the lower teeth, and blow air through the narrow gap. No k at the start and no sh: the lips stay relaxed, not rounded.',
        commonError:
          'Speakers of Russian and Ukrainian usually say a soft х («хь»), a щ-like sh, or read the spelling and say k («kino» as «кино»). The soft х is the closest, but it is made too far back and too rough.',
        ukNote:
          'Ukrainian х is softened less before і than Russian х, so Ukrainian speakers more often fall back to a hard [x].',
        drill:
          'Say «й» as in «йод» and keep going without voice — a whispered, hissing й is the kj sound. Then put it before a vowel: «kj-i — kino», «kj-ø — kjøre».',
      },
      nb: {
        description:
          'En myk susing midt i munnen, som «ch» i tysk «ich». Skrives kj, tj og k foran i, y, ei, øy: «kjøkken», «tjue», «kino», «kyss».',
        howTo:
          'Løft midten av tunga mot den harde ganen, hold tungespissen nede bak tennene i underkjeven, og blås luft gjennom den smale åpningen. Ingen k først og ingen sj: leppene er avslappet, ikke runde.',
        commonError:
          'De som snakker russisk og ukrainsk, sier ofte en myk х («хь»), en sj-lignende щ, eller leser skrivemåten og sier k («kino» som «кино»). Den myke х-en er nærmest, men den lages for langt bak og for hardt.',
        ukNote:
          'Ukrainsk х blir mindre myk foran і enn russisk х, så ukrainsktalende faller oftere tilbake til en hard [x].',
        drill:
          'Si «j» som i «ja» og fortsett uten stemme — en hvisket, susende j er kj-lyden. Sett den så foran en vokal: «kj-i — kino», «kj-ø — kjøre».',
      },
      ru: {
        description:
          'Мягкое шипение в середине рта, как «ch» в немецком «ich». Пишется kj, tj и k перед i, y, ei, øy: «kjøkken», «tjue», «kino», «kyss».',
        howTo:
          'Поднимите середину языка к твёрдому нёбу, кончик держите внизу за нижними зубами и пропускайте воздух через узкую щель. Без «к» в начале и без «ш»: губы расслаблены, не округлены.',
        commonError:
          'Говорящие по-русски и по-украински обычно произносят мягкое «хь», «щ» или читают по написанию — «к» («kino» как «кино»). «Хь» ближе всего, но оно образуется слишком глубоко и звучит слишком грубо.',
        ukNote:
          'Украинское «х» перед «і» смягчается слабее русского, поэтому говорящие по-украински чаще сбиваются на твёрдое «х».',
        drill:
          'Скажите «й», как в «йод», и продолжайте без голоса — шёпотом, с шипением. Это и есть kj. Потом поставьте его перед гласной: «kj-i — kino», «kj-ø — kjøre».',
      },
      uk: {
        description:
          'М’яке шипіння в середині рота, як «ch» у німецькому «ich». Пишеться kj, tj і k перед i, y, ei, øy: «kjøkken», «tjue», «kino», «kyss».',
        howTo:
          'Підніміть середину язика до твердого піднебіння, кінчик тримайте внизу за нижніми зубами й пропускайте повітря крізь вузьку щілину. Без «к» на початку й без «ш»: губи розслаблені, не округлені.',
        commonError:
          'Ті, хто говорить українською чи російською, зазвичай вимовляють м’яке «хь», «щ» або читають за написанням — «к» («kino» як «кіно»). «Хь» найближче, але воно утворюється надто глибоко й звучить надто грубо.',
        ukNote:
          'Українське «х» перед «і» пом’якшується слабше, ніж російське, тому україномовні частіше збиваються на тверде «х».',
        drill:
          'Скажіть «й», як у «йод», і продовжуйте без голосу — пошепки, з шипінням. Це і є kj. Потім поставте його перед голосним: «kj-i — kino», «kj-ø — kjøre».',
      },
    },
  },

  'nb:sj': {
    carrierWords: ['sju', 'skjorte', 'ski', 'stasjon', 'skje', 'sjø'],
    texts: {
      en: {
        description:
          'A hushing «sh». Written sj, skj, sk before i, y, ei, øy, and -sj- in loanwords: «sju», «skjorte», «ski», «stasjon». The k of skj and sk is never heard.',
        howTo:
          'Lift the front of the tongue towards the ridge behind the upper teeth, as for English «sh», and round the lips a little. One sound, not s + j and not s + k.',
        commonError:
          'Speakers of Russian and Ukrainian often read the letters: «skjorte» as «скьорте», «ski» as «ски», «sju» as «сью». A hard ш is a smaller slip — many Norwegians say it close to that too — but the separate s, k or j is a real error.',
        ukNote: null,
        drill:
          'Say «ш» and let the lips round a little, then add a vowel: «sj-u — sju», «sj-i — ski». Read pairs where the spelling tempts you: «ski — skole» (sh — sk), «skjære — sko».',
      },
      nb: {
        description:
          'En sjelyd. Skrives sj, skj, sk foran i, y, ei, øy, og -sj- i lånord: «sju», «skjorte», «ski», «stasjon». k-en i skj og sk høres aldri.',
        howTo:
          'Løft fremre del av tunga mot kanten bak tennene i overkjeven, som for engelsk «sh», og rund leppene litt. Én lyd, ikke s + j og ikke s + k.',
        commonError:
          'De som snakker russisk og ukrainsk, leser ofte bokstavene: «skjorte» som «скьорте», «ski» som «ски», «sju» som «сью». En hard ш er en mindre feil — mange nordmenn sier noe nær det — men en egen s, k eller j er en ekte feil.',
        ukNote: null,
        drill:
          'Si «sj» og rund leppene litt, legg så til en vokal: «sj-u — sju», «sj-i — ski». Les par der skrivemåten frister: «ski — skole» (sj — sk), «skjære — sko».',
      },
      ru: {
        description:
          'Шипящий звук, похожий на «ш». Пишется sj, skj, sk перед i, y, ei, øy и -sj- в заимствованиях: «sju», «skjorte», «ski», «stasjon». «k» в skj и sk не произносится никогда.',
        howTo:
          'Поднимите переднюю часть языка к бугоркам за верхними зубами, как для «ш», и чуть округлите губы. Это один звук — не «с» + «й» и не «с» + «к».',
        commonError:
          'Говорящие по-русски и по-украински часто читают по буквам: «skjorte» как «скьорте», «ski» как «ски», «sju» как «сью». Твёрдое «ш» — ошибка небольшая, многие норвежцы и сами говорят близко к нему, а вот отдельные «с», «к» или «й» — настоящая ошибка.',
        ukNote: null,
        drill:
          'Скажите «ш», чуть округлив губы, и добавьте гласную: «sj-u — sju», «sj-i — ski». Читайте пары, где написание сбивает: «ski — skole» (ш — ск), «skjære — sko».',
      },
      uk: {
        description:
          'Шиплячий звук, схожий на «ш». Пишеться sj, skj, sk перед i, y, ei, øy і -sj- у запозиченнях: «sju», «skjorte», «ski», «stasjon». «k» у skj і sk не вимовляється ніколи.',
        howTo:
          'Підніміть передню частину язика до горбиків за верхніми зубами, як для «ш», і трохи округліть губи. Це один звук — не «с» + «й» і не «с» + «к».',
        commonError:
          'Ті, хто говорить українською чи російською, часто читають за літерами: «skjorte» як «ськйорте», «ski» як «скі», «sju» як «сью». Тверде «ш» — помилка невелика, багато норвежців і самі кажуть близько до нього, а от окремі «с», «к» чи «й» — справжня помилка.',
        ukNote: null,
        drill:
          'Скажіть «ш», трохи округливши губи, і додайте голосний: «sj-u — sju», «sj-i — ski». Читайте пари, де написання збиває: «ski — skole» (ш — ск), «skjære — sko».',
      },
    },
  },

  'nb:y': {
    carrierWords: ['by', 'lys', 'syv', 'ny', 'fly', 'lykke'],
    texts: {
      en: {
        description:
          'A rounded front vowel: the tongue of «i» with the lips of «u». Written y: long in «by», «lys», short in «lykke». It tells words apart: «lys» (light) — «lis» — «lus» (louse).',
        howTo:
          'Say a long «i» and, without moving the tongue, round the lips tightly into a small opening. The tongue stays high and forward; only the lips change.',
        commonError:
          'Speakers of Russian say «ю» (a j glide before u: «by» as «бю») or a plain «у». The tongue falls back with the lips; it must stay where it is for «и».',
        ukNote:
          'Ukrainian speakers more often go the other way and say «і» or the open Ukrainian «и»: the lips stay spread.',
        drill:
          'Hold «iiii» and slowly round the lips until it turns into «yyyy» — the tongue does not move. Then read «lis — lys — lus», «lin — lyn — lun».',
      },
      nb: {
        description:
          'En rund fremre vokal: tunga som for «i», leppene som for «u». Skrives y: lang i «by», «lys», kort i «lykke». Den skiller ord: «lys» — «lis» — «lus».',
        howTo:
          'Si en lang «i», og rund leppene stramt til en liten åpning uten å flytte tunga. Tunga blir høyt og fremme; bare leppene endrer seg.',
        commonError:
          'De som snakker russisk, sier «ю» (en j foran u: «by» som «бю») eller en vanlig «у». Tunga glir bakover med leppene; den skal bli der den er for «i».',
        ukNote:
          'Ukrainsktalende går oftere den andre veien og sier «і» eller den åpne ukrainske «и»: leppene blir ikke runde.',
        drill:
          'Hold «iiii» og rund leppene sakte til den blir «yyyy» — tunga står stille. Les så «lis — lys — lus», «lin — lyn — lun».',
      },
      ru: {
        description:
          'Огубленный гласный переднего ряда: язык как для «и», губы как для «у». Пишется y: долгий в «by», «lys», краткий в «lykke». Различает слова: «lys» (свет) — «lis» — «lus» (вошь).',
        howTo:
          'Скажите долгое «и» и, не двигая языком, плотно округлите губы в маленькое отверстие. Язык остаётся высоко и впереди — меняются только губы.',
        commonError:
          'Говорящие по-русски произносят «ю» (с «й» перед «у»: «by» как «бю») или просто «у». Вместе с губами язык уходит назад, а должен оставаться на месте «и».',
        ukNote:
          'Говорящие по-украински чаще ошибаются в другую сторону и произносят «і» или открытое украинское «и»: губы не округляются.',
        drill:
          'Тяните «иииии» и медленно округляйте губы, пока не получится «yyyy», — язык не двигается. Потом читайте «lis — lys — lus», «lin — lyn — lun».',
      },
      uk: {
        description:
          'Огублений голосний переднього ряду: язик як для «і», губи як для «у». Пишеться y: довгий у «by», «lys», короткий у «lykke». Розрізняє слова: «lys» (світло) — «lis» — «lus» (воша).',
        howTo:
          'Скажіть довге «і» і, не рухаючи язиком, щільно округліть губи в маленький отвір. Язик залишається високо й попереду — змінюються лише губи.',
        commonError:
          'Російськомовні вимовляють «ю» (з «й» перед «у»: «by» як «бю») або просто «у». Разом із губами язик відходить назад, а має лишатися на місці «і».',
        ukNote:
          'Україномовні частіше помиляються в інший бік і вимовляють «і» або відкрите українське «и»: губи не округлюються.',
        drill:
          'Тягніть «іііі» і повільно округлюйте губи, доки не вийде «yyyy», — язик не рухається. Потім читайте «lis — lys — lus», «lin — lyn — lun».',
      },
    },
  },

  'nb:uu': {
    carrierWords: ['hus', 'du', 'ut', 'mus', 'bru', 'hund'],
    texts: {
      en: {
        description:
          'The Norwegian u is not the u of most languages: it sits between «u» and «y», in the middle of the mouth. Written u: long in «hus», «du», short in «hund».',
        howTo:
          'Put the tongue in the middle of the mouth, neither forward as for «i» nor back as for «u». Round the lips and press them close together, with a small opening — do not push them forward into a tube.',
        commonError:
          'Speakers of Russian and Ukrainian say their own back «у» with lips pushed out: «hus» sounds like «хус». The opposite slip — a full «ю» with a j — happens too.',
        ukNote: null,
        drill:
          'Say «ю» without the «й» at the start, then relax the lips so they are pressed rather than pushed out. Contrast «bok» (back, like «у») with «buk» (Norwegian u), «ost» with «ut».',
      },
      nb: {
        description:
          'Norsk u er ikke u-en i de fleste språk: den ligger mellom «u» og «y», midt i munnen. Skrives u: lang i «hus», «du», kort i «hund».',
        howTo:
          'Legg tunga midt i munnen, verken fremme som for «i» eller bak som for «o». Rund leppene og press dem tett sammen med en liten åpning — ikke skyv dem fram til et rør.',
        commonError:
          'De som snakker russisk og ukrainsk, sier sin egen bakre «у» med leppene skjøvet fram: «hus» høres ut som «хус». Den motsatte feilen — en full «ю» med j — skjer også.',
        ukNote: null,
        drill:
          'Si «ju» uten j-en først, og slapp av i leppene så de presses sammen i stedet for å skyves fram. Sammenlign «bok» (bakre, som russisk «у») med «buk» (norsk u), «ost» med «ut».',
      },
      ru: {
        description:
          'Норвежское u — не русское «у»: оно лежит между «у» и «ю», в середине рта. Пишется u: долгое в «hus», «du», краткое в «hund».',
        howTo:
          'Язык — в середине рта: не впереди, как для «и», и не сзади, как для «у». Губы округлите и сблизьте, оставив маленькое отверстие, — но не вытягивайте их трубочкой.',
        commonError:
          'Говорящие по-русски и по-украински произносят своё заднее «у» с вытянутыми губами: «hus» звучит как «хус». Бывает и обратное — полное «ю» с «й».',
        ukNote: null,
        drill:
          'Скажите «ю» без «й» в начале и расслабьте губы, чтобы они были сжаты, а не вытянуты. Сравните «bok» (заднее, как «у») и «buk» (норвежское u), «ost» и «ut».',
      },
      uk: {
        description:
          'Норвезьке u — не українське «у»: воно лежить між «у» і «ю», у середині рота. Пишеться u: довге в «hus», «du», коротке в «hund».',
        howTo:
          'Язик — у середині рота: не попереду, як для «і», і не позаду, як для «у». Губи округліть і зблизьте, залишивши маленький отвір, — але не витягуйте їх трубочкою.',
        commonError:
          'Ті, хто говорить українською чи російською, вимовляють своє заднє «у» з витягнутими губами: «hus» звучить як «хус». Буває й навпаки — повне «ю» з «й».',
        ukNote: null,
        drill:
          'Скажіть «ю» без «й» на початку й розслабте губи, щоб вони були стиснуті, а не витягнуті. Порівняйте «bok» (заднє, як «у») і «buk» (норвезьке u), «ost» і «ut».',
      },
    },
  },

  'nb:oe': {
    carrierWords: ['søt', 'øl', 'brød', 'høst', 'søster', 'bønner'],
    texts: {
      en: {
        description:
          'A rounded front vowel: the tongue of «e» with rounded lips. Written ø: long and closer in «søt», «brød», short and more open in «søster», «bønner».',
        howTo:
          'Say «e» and round the lips without moving the tongue back. For the short ø open the jaw a little more, as for the short «e» in «penn», still rounding the lips.',
        commonError:
          'Speakers of Russian and Ukrainian say «о» or «ё» («søt» as «сот» or «сёт»): the tongue goes back with the lips. Some say «е» and forget to round.',
        ukNote: null,
        drill:
          'Hold «eeee» and round the lips slowly until it turns into «øøøø»; the tongue does not move. Then read «se — sø — så», «tre — trø».',
      },
      nb: {
        description:
          'En rund fremre vokal: tunga som for «e», leppene runde. Skrives ø: lang og trangere i «søt», «brød», kort og åpnere i «søster», «bønner».',
        howTo:
          'Si «e» og rund leppene uten å trekke tunga bakover. For kort ø åpner du kjeven litt mer, som for kort «e» i «penn», og runder fortsatt leppene.',
        commonError:
          'De som snakker russisk og ukrainsk, sier «о» eller «ё» («søt» som «сот» eller «сёт»): tunga går bakover med leppene. Noen sier «e» og glemmer å runde.',
        ukNote: null,
        drill:
          'Hold «eeee» og rund leppene sakte til den blir «øøøø»; tunga står stille. Les så «se — sø — så», «tre — trø».',
      },
      ru: {
        description:
          'Огубленный гласный переднего ряда: язык как для «е», губы округлены. Пишется ø: долгое и более закрытое в «søt», «brød», краткое и более открытое в «søster», «bønner».',
        howTo:
          'Скажите «э» и округлите губы, не отводя язык назад. Для краткого ø чуть сильнее опустите челюсть, как для краткого «e» в «penn», губы всё так же округлены.',
        commonError:
          'Говорящие по-русски и по-украински произносят «о» или «ё» («søt» как «сот» или «сёт»): вместе с губами язык уходит назад. Некоторые говорят «э» и забывают округлить губы.',
        ukNote: null,
        drill:
          'Тяните «ээээ» и медленно округляйте губы, пока не получится «øøøø»; язык не двигается. Потом читайте «se — sø — så», «tre — trø».',
      },
      uk: {
        description:
          'Огублений голосний переднього ряду: язик як для «е», губи округлені. Пишеться ø: довге й закритіше в «søt», «brød», коротке й відкритіше в «søster», «bønner».',
        howTo:
          'Скажіть «е» й округліть губи, не відводячи язик назад. Для короткого ø трохи сильніше опустіть щелепу, як для короткого «e» в «penn», губи так само округлені.',
        commonError:
          'Ті, хто говорить українською чи російською, вимовляють «о» або «ьо» («søt» як «сот» чи «сьот»): разом із губами язик відходить назад. Дехто каже «е» й забуває округлити губи.',
        ukNote: null,
        drill:
          'Тягніть «ееее» й повільно округлюйте губи, доки не вийде «øøøø»; язик не рухається. Потім читайте «se — sø — så», «tre — trø».',
      },
    },
  },

  'nb:ae': {
    carrierWords: ['være', 'lærer', 'her', 'er', 'ærlig', 'sterk'],
    texts: {
      en: {
        description:
          'An open front vowel, between «e» and «a». Written æ, and very often e before r: «være», «lærer», «her», «er», «sterk».',
        howTo:
          'Start from «e» and drop the jaw clearly, so the mouth opens almost as for «a»; the tongue stays forward and the lips spread.',
        commonError:
          'Speakers of Russian and Ukrainian say a closed «е» or «э»: «være» as «вэре», «her» as «хэр». The jaw does not open enough, and the word sounds like a different one.',
        ukNote: null,
        drill:
          'Say «e — æ — a» on one breath, opening the jaw a step at a time, and stop on the middle one. Then read «se — sær», «le — lære», «ve — være».',
      },
      nb: {
        description:
          'En åpen fremre vokal, mellom «e» og «a». Skrives æ, og svært ofte e foran r: «være», «lærer», «her», «er», «sterk».',
        howTo:
          'Begynn på «e» og senk kjeven tydelig, så munnen åpner seg nesten som for «a»; tunga blir fremme og leppene er brede.',
        commonError:
          'De som snakker russisk og ukrainsk, sier en trang «е» eller «э»: «være» som «вэре», «her» som «хэр». Kjeven åpner seg ikke nok, og ordet høres ut som et annet.',
        ukNote: null,
        drill:
          'Si «e — æ — a» på ett pust, åpne kjeven et trinn om gangen, og stopp på den midterste. Les så «se — sær», «le — lære», «ve — være».',
      },
      ru: {
        description:
          'Открытый гласный переднего ряда, между «э» и «а». Пишется æ и очень часто e перед r: «være», «lærer», «her», «er», «sterk».',
        howTo:
          'Начните с «э» и заметно опустите челюсть, чтобы рот открылся почти как для «а»; язык остаётся впереди, губы растянуты.',
        commonError:
          'Говорящие по-русски и по-украински произносят закрытое «е» или «э»: «være» как «вэре», «her» как «хэр». Челюсть открывается недостаточно, и слово звучит как другое.',
        ukNote: null,
        drill:
          'Скажите «э — æ — а» на одном выдохе, открывая челюсть по шагу, и остановитесь на среднем. Потом читайте «se — sær», «le — lære», «ve — være».',
      },
      uk: {
        description:
          'Відкритий голосний переднього ряду, між «е» і «а». Пишеться æ і дуже часто e перед r: «være», «lærer», «her», «er», «sterk».',
        howTo:
          'Почніть з «е» й помітно опустіть щелепу, щоб рот відкрився майже як для «а»; язик залишається попереду, губи розтягнуті.',
        commonError:
          'Ті, хто говорить українською чи російською, вимовляють закрите «е»: «være» як «вере», «her» як «хер». Щелепа відкривається недостатньо, і слово звучить як інше.',
        ukNote: null,
        drill:
          'Скажіть «е — æ — а» на одному видиху, відкриваючи щелепу крок за кроком, і зупиніться на середньому. Потім читайте «se — sær», «le — lære», «ve — være».',
      },
    },
  },

  'nb:vowel_length': {
    carrierWords: ['tak', 'takk', 'fin', 'finn', 'hat', 'hatt'],
    texts: {
      en: {
        description:
          'Every stressed syllable in Norwegian is either a long vowel or a short vowel followed by a long consonant. Length tells words apart: «tak» (roof) — «takk» (thanks), «fin» — «finn». A double consonant in spelling usually means a short vowel.',
        howTo:
          'Hold a long vowel about twice as long as a short one, without letting it glide into another vowel. After a short vowel, hold the next consonant instead: «tak-k», «fin-n».',
        commonError:
          'Russian and Ukrainian have no long vowels, so speakers make every stressed vowel the same medium length: «tak» and «takk» sound alike. Stress is made by loudness only, and the long vowel gets cut short.',
        ukNote: null,
        drill:
          'Read pairs and tap the table on each vowel — two taps for long, one for short: «tak — takk», «fin — finn», «hat — hatt», «tome — tomme». Record yourself and listen whether the pairs differ.',
      },
      nb: {
        description:
          'Hver trykksterk stavelse i norsk har enten lang vokal eller kort vokal med lang konsonant etter. Lengden skiller ord: «tak» — «takk», «fin» — «finn». Dobbel konsonant i skrift betyr som regel kort vokal.',
        howTo:
          'Hold en lang vokal omtrent dobbelt så lenge som en kort, uten at den glir over i en annen vokal. Etter kort vokal holder du konsonanten i stedet: «tak-k», «fin-n».',
        commonError:
          'Russisk og ukrainsk har ikke lange vokaler, så de som snakker dem, gir alle trykksterke vokaler samme middels lengde: «tak» og «takk» høres like ut. Trykket lages bare med styrke, og den lange vokalen blir for kort.',
        ukNote: null,
        drill:
          'Les par og bank i bordet på hver vokal — to slag for lang, ett for kort: «tak — takk», «fin — finn», «hat — hatt», «tome — tomme». Ta opp deg selv og lytt om parene er forskjellige.',
      },
      ru: {
        description:
          'Каждый ударный слог в норвежском — это либо долгий гласный, либо краткий гласный с долгим согласным после него. Долгота различает слова: «tak» (крыша) — «takk» (спасибо), «fin» — «finn». Двойная согласная на письме обычно значит краткий гласный.',
        howTo:
          'Тяните долгий гласный примерно вдвое дольше краткого и не давайте ему переходить в другой гласный. После краткого гласного тяните следующий согласный: «tak-k», «fin-n».',
        commonError:
          'В русском и украинском нет долгих гласных, поэтому все ударные гласные получаются одинаковой средней длины: «tak» и «takk» звучат одинаково. Ударение делается только силой голоса, и долгий гласный обрубается.',
        ukNote: null,
        drill:
          'Читайте пары и стучите по столу на каждом гласном — два удара на долгий, один на краткий: «tak — takk», «fin — finn», «hat — hatt», «tome — tomme». Запишите себя и послушайте, различаются ли пары.',
      },
      uk: {
        description:
          'Кожен наголошений склад у норвезькій — це або довгий голосний, або короткий голосний із довгим приголосним після нього. Довгота розрізняє слова: «tak» (дах) — «takk» (дякую), «fin» — «finn». Подвоєний приголосний на письмі зазвичай означає короткий голосний.',
        howTo:
          'Тягніть довгий голосний приблизно вдвічі довше за короткий і не давайте йому переходити в інший голосний. Після короткого голосного тягніть наступний приголосний: «tak-k», «fin-n».',
        commonError:
          'В українській і російській немає довгих голосних, тому всі наголошені голосні виходять однакової середньої довжини: «tak» і «takk» звучать однаково. Наголос робиться лише силою голосу, і довгий голосний обрізається.',
        ukNote: null,
        drill:
          'Читайте пари й стукайте по столу на кожному голосному — два удари на довгий, один на короткий: «tak — takk», «fin — finn», «hat — hatt», «tome — tomme». Запишіть себе й послухайте, чи різняться пари.',
      },
    },
  },

  'nb:tone': {
    carrierWords: ['bønder', 'bønner', 'huset', 'jente', 'gate', 'komme'],
    texts: {
      en: {
        description:
          'Norwegian words of two or more syllables carry one of two melodies on the stressed syllable. Toneme 1 starts low and rises; toneme 2 first falls, then rises. The melody can tell words apart: «bønder» (farmers, toneme 1) — «bønner» (beans, toneme 2).',
        howTo:
          'Toneme 1: say the stressed syllable low and let the voice climb on the next one («huset»). Toneme 2: start the stressed syllable higher, let it drop, and rise again on the following syllable («jente», «gate»). Most two-syllable words ending in -e have toneme 2; a one-syllable word with an ending (-en, -et) keeps toneme 1.',
        commonError:
          'Speakers of Russian and Ukrainian mark stress by loudness and say every word with the same flat or falling melody, so toneme 2 is lost and «bønner» sounds like «bønder». Sometimes the whole sentence gets a question-like rise instead.',
        ukNote: null,
        drill:
          'Hum the melody first with closed lips — «mm-MM» for toneme 1, «MM-mm-MM» falling then rising for toneme 2 — then put the word on it. Pairs: «bønder — bønner», «tanken (the tank) — tanken (the thought)», «huset — huse».',
      },
      nb: {
        description:
          'Norske ord med to eller flere stavelser har en av to melodier på den trykksterke stavelsen. Tonem 1 begynner lavt og stiger; tonem 2 faller først og stiger så. Melodien kan skille ord: «bønder» (tonem 1) — «bønner» (tonem 2).',
        howTo:
          'Tonem 1: si den trykksterke stavelsen lavt og la stemmen stige på den neste («huset»). Tonem 2: begynn den trykksterke stavelsen høyere, la den falle og stig igjen på stavelsen etter («jente», «gate»). De fleste tostavelsesord på -e har tonem 2; et enstavelsesord med endelse (-en, -et) beholder tonem 1.',
        commonError:
          'De som snakker russisk og ukrainsk, markerer trykket med styrke og sier hvert ord med samme flate eller fallende melodi, så tonem 2 forsvinner og «bønner» høres ut som «bønder». Noen ganger får hele setningen en spørrende stigning i stedet.',
        ukNote: null,
        drill:
          'Nynn melodien først med lukket munn — «mm-MM» for tonem 1, «MM-mm-MM» fallende og så stigende for tonem 2 — og legg så ordet på den. Par: «bønder — bønner», «tanken (stridsvogn) — tanken (tanke)», «huset — huse».',
      },
      ru: {
        description:
          'Норвежские слова из двух и более слогов несут на ударном слоге одну из двух мелодий. Тонема 1 начинается низко и поднимается; тонема 2 сначала падает, потом поднимается. Мелодия может различать слова: «bønder» (крестьяне, тонема 1) — «bønner» (бобы, тонема 2).',
        howTo:
          'Тонема 1: ударный слог низко, голос поднимается на следующем («huset»). Тонема 2: ударный слог начните выше, дайте голосу упасть и снова подняться на следующем слоге («jente», «gate»). Большинство двусложных слов на -e — с тонемой 2; односложное слово с окончанием (-en, -et) сохраняет тонему 1.',
        commonError:
          'Говорящие по-русски и по-украински выделяют ударение силой голоса и произносят каждое слово с одной и той же ровной или падающей мелодией — тонема 2 пропадает, и «bønner» звучит как «bønder». Иногда вместо этого вся фраза получает вопросительный подъём.',
        ukNote: null,
        drill:
          'Сначала промычите мелодию с закрытым ртом — «мм-ММ» для тонемы 1, «ММ-мм-ММ» (вниз, потом вверх) для тонемы 2 — и наложите на неё слово. Пары: «bønder — bønner», «tanken (танк) — tanken (мысль)», «huset — huse».',
      },
      uk: {
        description:
          'Норвезькі слова з двох і більше складів мають на наголошеному складі одну з двох мелодій. Тонема 1 починається низько й піднімається; тонема 2 спершу падає, потім піднімається. Мелодія може розрізняти слова: «bønder» (селяни, тонема 1) — «bønner» (боби, тонема 2).',
        howTo:
          'Тонема 1: наголошений склад низько, голос піднімається на наступному («huset»). Тонема 2: наголошений склад почніть вище, дайте голосу впасти й знову піднятися на наступному складі («jente», «gate»). Більшість двоскладових слів на -e мають тонему 2; односкладове слово із закінченням (-en, -et) зберігає тонему 1.',
        commonError:
          'Ті, хто говорить українською чи російською, виділяють наголос силою голосу й вимовляють кожне слово з однаковою рівною чи спадною мелодією — тонема 2 зникає, і «bønner» звучить як «bønder». Іноді натомість уся фраза отримує питальний підйом.',
        ukNote: null,
        drill:
          'Спершу промугикайте мелодію із закритим ротом — «мм-ММ» для тонеми 1, «ММ-мм-ММ» (униз, потім угору) для тонеми 2 — і накладіть на неї слово. Пари: «bønder — bønner», «tanken (танк) — tanken (думка)», «huset — huse».',
      },
    },
  },

  'nb:retroflex': {
    carrierWords: ['norsk', 'kart', 'barn', 'fordi', 'dårlig', 'først'],
    texts: {
      en: {
        description:
          'In eastern Norwegian r merges with a following s, t, d, n or l into one sound made with the tongue tip curled back: «norsk», «kart», «barn», «fordi», «dårlig». No separate r is heard — even across words: «har du», «er snill».',
        howTo:
          'Curl the tongue tip up and back behind the ridge of the upper teeth and make the s, t, d, n or l there, in one movement. For rs this gives a dark «sh».',
        commonError:
          'Speakers of Russian and Ukrainian roll the r and then say the consonant: «norsk» as «норск», «kart» as «карт». Good news for rs: the Russian and Ukrainian hard «ш» is already close to it.',
        ukNote: null,
        drill:
          'Say «r-t» faster and faster until the r disappears into the t and only the curled tip is left. Then read «katt — kart», «Lasse — Lars», «hvordan».',
      },
      nb: {
        description:
          'På østnorsk smelter r sammen med en s, t, d, n eller l etter seg til én lyd, laget med tungespissen bøyd bakover: «norsk», «kart», «barn», «fordi», «dårlig». Ingen egen r høres — heller ikke mellom ord: «har du», «er snill».',
        howTo:
          'Bøy tungespissen opp og bakover bak tannkjøttkanten i overkjeven, og lag s, t, d, n eller l der, i én bevegelse. For rs gir det en mørk «sj».',
        commonError:
          'De som snakker russisk og ukrainsk, ruller r-en og sier så konsonanten: «norsk» som «норск», «kart» som «карт». Godt nytt for rs: den harde russiske og ukrainske «ш» ligger allerede nær.',
        ukNote: null,
        drill:
          'Si «r-t» fortere og fortere til r-en forsvinner inn i t-en og bare den bøyde tungespissen er igjen. Les så «katt — kart», «Lasse — Lars», «hvordan».',
      },
      ru: {
        description:
          'В восточнонорвежском r сливается со следующим s, t, d, n или l в один звук, который произносится с загнутым назад кончиком языка: «norsk», «kart», «barn», «fordi», «dårlig». Отдельного «р» не слышно — даже на стыке слов: «har du», «er snill».',
        howTo:
          'Загните кончик языка вверх и назад, за бугорки верхних зубов, и произнесите там s, t, d, n или l одним движением. Для rs получается тёмное «ш».',
        commonError:
          'Говорящие по-русски и по-украински раскатывают «р» и потом произносят согласный: «norsk» как «норск», «kart» как «карт». Хорошая новость про rs: русское и украинское твёрдое «ш» уже близко к нему.',
        ukNote: null,
        drill:
          'Говорите «р-т» всё быстрее, пока «р» не растворится в «т» и не останется только загнутый кончик языка. Потом читайте «katt — kart», «Lasse — Lars», «hvordan».',
      },
      uk: {
        description:
          'У східнонорвезькій r зливається з наступним s, t, d, n або l в один звук, що вимовляється із загнутим назад кінчиком язика: «norsk», «kart», «barn», «fordi», «dårlig». Окремого «р» не чути — навіть на стику слів: «har du», «er snill».',
        howTo:
          'Загніть кінчик язика вгору й назад, за горбики верхніх зубів, і вимовте там s, t, d, n або l одним рухом. Для rs виходить темне «ш».',
        commonError:
          'Ті, хто говорить українською чи російською, розкочують «р» і потім вимовляють приголосний: «norsk» як «норськ», «kart» як «карт». Добра новина про rs: українське й російське тверде «ш» уже близьке до нього.',
        ukNote: null,
        drill:
          'Кажіть «р-т» дедалі швидше, доки «р» не розчиниться в «т» і не залишиться тільки загнутий кінчик язика. Потім читайте «katt — kart», «Lasse — Lars», «hvordan».',
      },
    },
  },

  'nb:schwa': {
    carrierWords: ['jente', 'gate', 'hesten', 'bare', 'komme', 'gutten'],
    texts: {
      en: {
        description:
          'An unstressed e — at the end of a word and in endings — is a weak, short, neutral vowel, like the «a» in English «sofa»: «jente», «gate», «hesten», «bare».',
        howTo:
          'Relax the tongue and lips completely, open the mouth only a little and let out a short, quiet sound. Do not shape a clear «e».',
        commonError:
          'Speakers of Russian and Ukrainian say a full, clear «е»/«э» («jente» as «йентэ»), which puts a second stress on the word. Russian speakers also sometimes reduce it to an «и»-like sound, as in unstressed Russian «е».',
        ukNote:
          'Ukrainian does not weaken unstressed vowels, so Ukrainian speakers are the most likely to keep a full «е» in every ending.',
        drill:
          'Say the word with the stressed syllable loud and the ending almost swallowed: «JEN-te», «GA-te», «HES-ten». Compare with the full e of «se» — the ending must sound clearly weaker.',
      },
      nb: {
        description:
          'Trykklett e — på slutten av ord og i endelser — er en svak, kort, nøytral vokal, som «a» i engelsk «sofa»: «jente», «gate», «hesten», «bare».',
        howTo:
          'Slapp helt av i tunga og leppene, åpne munnen bare litt og slipp ut en kort, stille lyd. Ikke form en tydelig «e».',
        commonError:
          'De som snakker russisk og ukrainsk, sier en full, tydelig «е»/«э» («jente» som «йентэ»), som gir ordet et ekstra trykk. Russisktalende gjør den også noen ganger om til en i-aktig lyd, som trykklett russisk «е».',
        ukNote:
          'Ukrainsk svekker ikke trykklette vokaler, så ukrainsktalende beholder oftest en full «е» i hver endelse.',
        drill:
          'Si ordet med sterk trykkstavelse og endelsen nesten svelget: «JEN-te», «GA-te», «HES-ten». Sammenlign med den fulle e-en i «se» — endelsen skal høres tydelig svakere ut.',
      },
      ru: {
        description:
          'Безударное e — в конце слова и в окончаниях — это слабый, короткий, нейтральный гласный, как «a» в английском «sofa»: «jente», «gate», «hesten», «bare».',
        howTo:
          'Полностью расслабьте язык и губы, приоткройте рот совсем немного и выпустите короткий тихий звук. Чёткое «э» не выговаривайте.',
        commonError:
          'Говорящие по-русски и по-украински произносят полное, чёткое «е»/«э» («jente» как «йентэ»), и в слове появляется второе ударение. Русскоязычные иногда сводят его к «и»-образному звуку, как в безударном русском «е».',
        ukNote:
          'В украинском безударные гласные не ослабляются, поэтому говорящие по-украински чаще всех сохраняют полное «е» в каждом окончании.',
        drill:
          'Произносите слово с громким ударным слогом и почти проглоченным окончанием: «JEN-te», «GA-te», «HES-ten». Сравните с полным e в «se» — окончание должно звучать заметно слабее.',
      },
      uk: {
        description:
          'Ненаголошене e — у кінці слова й у закінченнях — це слабкий, короткий, нейтральний голосний, як «a» в англійському «sofa»: «jente», «gate», «hesten», «bare».',
        howTo:
          'Повністю розслабте язик і губи, лише трохи відкрийте рот і випустіть короткий тихий звук. Чіткого «е» не вимовляйте.',
        commonError:
          'Ті, хто говорить українською чи російською, вимовляють повне, чітке «е» («jente» як «йенте»), і в слові з’являється другий наголос. Російськомовні іноді зводять його до «і»-подібного звуку, як у ненаголошеному російському «е».',
        ukNote:
          'Українська не послаблює ненаголошених голосних, тому україномовні найчастіше зберігають повне «е» в кожному закінченні.',
        drill:
          'Вимовляйте слово з гучним наголошеним складом і майже проковтнутим закінченням: «JEN-te», «GA-te», «HES-ten». Порівняйте з повним e в «se» — закінчення має звучати помітно слабше.',
      },
    },
  },

  'nb:r': {
    carrierWords: ['rød', 'rar', 'fire', 'bror', 'prøve', 'år'],
    texts: {
      en: {
        description:
          'The eastern Norwegian r is a single quick tap of the tongue tip, not a long roll: «rød», «fire», «bror». Before s, t, d, n, l it merges with the consonant (see retroflexes). In the west and south many speakers use a throaty r — both are correct.',
        howTo:
          'Flick the tongue tip once against the ridge behind the upper teeth, as quickly as possible. One touch, then straight on to the next sound.',
        commonError:
          'Speakers of Russian and Ukrainian roll a strong trilled «р» with several taps, which sounds heavy and too long, especially at the end of a word («bror», «år»). It is also often said before s, t, d, n, l where Norwegian merges it.',
        ukNote: null,
        drill:
          'Say «да-да-да» very fast: the d turns into a single tap — that is the Norwegian r. Then read «fire», «være», «bare» with one light touch, and «bror», «år» without a trill at the end.',
      },
      nb: {
        description:
          'Den østnorske r-en er ett raskt slag med tungespissen, ikke en lang rulling: «rød», «fire», «bror». Foran s, t, d, n, l smelter den sammen med konsonanten (se retroflekser). På Vestlandet og Sørlandet bruker mange en skarre-r — begge er riktige.',
        howTo:
          'Slå tungespissen én gang mot kanten bak tennene i overkjeven, så raskt som mulig. Én berøring, og så rett videre til neste lyd.',
        commonError:
          'De som snakker russisk og ukrainsk, ruller en sterk «р» med flere slag, som høres tung og for lang ut, særlig på slutten av ord («bror», «år»). Den sies også ofte foran s, t, d, n, l der norsk smelter den sammen.',
        ukNote: null,
        drill:
          'Si «da-da-da» veldig fort: d-en blir til ett enkelt slag — det er den norske r-en. Les så «fire», «være», «bare» med én lett berøring, og «bror», «år» uten rulling på slutten.',
      },
      ru: {
        description:
          'Восточнонорвежское r — это один быстрый удар кончика языка, а не долгий раскат: «rød», «fire», «bror». Перед s, t, d, n, l оно сливается с согласным (см. ретрофлексы). На западе и юге многие говорят картавое r — правильно и так, и так.',
        howTo:
          'Один раз ударьте кончиком языка по бугоркам за верхними зубами, как можно быстрее. Одно касание — и сразу к следующему звуку.',
        commonError:
          'Говорящие по-русски и по-украински раскатывают сильное «р» в несколько ударов — звучит тяжело и слишком долго, особенно в конце слова («bror», «år»). Кроме того, его часто произносят перед s, t, d, n, l, где в норвежском оно сливается.',
        ukNote: null,
        drill:
          'Скажите «да-да-да» очень быстро: «д» превращается в один удар — это и есть норвежское r. Потом читайте «fire», «være», «bare» с одним лёгким касанием, а «bror», «år» — без раската в конце.',
      },
      uk: {
        description:
          'Східнонорвезьке r — це один швидкий удар кінчика язика, а не довгий розкат: «rød», «fire», «bror». Перед s, t, d, n, l воно зливається з приголосним (див. ретрофлекси). На заході й півдні багато хто вимовляє гаркаве r — правильно і так, і так.',
        howTo:
          'Один раз ударте кінчиком язика по горбиках за верхніми зубами, якомога швидше. Один дотик — і одразу до наступного звуку.',
        commonError:
          'Ті, хто говорить українською чи російською, розкочують сильне «р» у кілька ударів — звучить важко й задовго, особливо в кінці слова («bror», «år»). Крім того, його часто вимовляють перед s, t, d, n, l, де в норвезькій воно зливається.',
        ukNote: null,
        drill:
          'Скажіть «да-да-да» дуже швидко: «д» перетворюється на один удар — це і є норвезьке r. Потім читайте «fire», «være», «bare» з одним легким дотиком, а «bror», «år» — без розкату в кінці.',
      },
    },
  },
};
