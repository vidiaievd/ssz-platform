#!/usr/bin/env python3
"""«Norsk på jobb — IT»: the exercises of leksjon 2 and 3, and the edits of leksjon 1.

    python3 prisma/tools/norsk_it_units.py        # from services/content-service

Rewrites the keys of these leksjoner in prisma/data/norsk-it/{exercises,exercises.pending,vocab}.json
and copies their texts and grammar from docs/courses/norsk_it. Then render the Markdown:

    python3 .claude/skills/language-course-design/scripts/seed_to_md.py \
        services/content-service/prisma/data/norsk-it docs/courses/norsk_it

Quality rules for every closed item: .claude/skills/language-course-design/references/exercises.md §9.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from norsk_it_author import (CRIT, W_LEXIS, W_STRUCT, READ_ALOUD_REVIEW, WRITING_AI, adj, build, dictation,
                             errors, gap, listen, match, mc, noun, order, other, rg, sa, schema, speak,
                             sync_lessons, verb, write)

RU_SA = 'Ответьте на вопросы по тексту {} своими словами.'
RU_MC = 'Выберите значение слова из текста {}.'
RU_GAP = 'Вставьте подходящее слово из банка.'
RU_RECALL = 'Впишите слово сами — банка слов нет. Подсказка — перевод под предложением.'
NB_MC = 'Velg riktig betydning.'
T = 'Tips: '

# ═════════════════════════════════════════════════════════════════════════════
# Leksjon 1 — edits of the seeded JSON
# ═════════════════════════════════════════════════════════════════════════════


def patch_unit1(ex, pend):
    def find(sub, key):
        return next(d for d in ex[sub] if d['key'] == key)

    def replace(sub, key, doc):
        i = next(i for i, d in enumerate(ex[sub]) if d['key'] == key)
        ex[sub][i] = doc

    def drop(sub, key):
        ex[sub] = [d for d in ex[sub] if d['key'] != key]

    def after(sub, key, doc):
        drop(sub, doc['key'])
        i = next(i for i, d in enumerate(ex[sub]) if d['key'] == key)
        ex[sub].insert(i + 1, doc)

    # The author allows the AI stage on every free-form task (exercises.md §7)
    for docs in ex.values():
        for d in docs:
            if not d['key'].startswith('it-1') and not d['key'].startswith('it-g1'):
                continue
            if d['template'] == 'read_aloud':
                d['content']['review'] = dict(READ_ALOUD_REVIEW)
            if d['template'] == 'writing_task':
                d['content']['settings'].update(WRITING_AI)

    # 1A — no gap that is half of a fixed pair; `trives` gets an item
    replace('1A', 'it-1a-gap', gap('it-1a-gap', RU_GAP, [
        ('Taras leser en [stillingsannonse] på Finn.no.', 'Нужно слово со значением «объявление о вакансии».'),
        ('Teamet jobber [smidig] med Scrum.', 'Нужно слово со значением «гибко, agile».'),
        ('Firmaet tilbyr to dager [hjemmekontor] i uka.', 'Нужно слово со значением «работа из дома».'),
        ('Han har erfaring med SQL og [relasjonsdatabaser].', 'Нужно слово со значением «реляционные базы данных».'),
        ('Søkeren må kunne [grunnleggende] SQL.', 'Нужно слово со значением «базовый».'),
        ('Søkeren må forstå vanlig [arbeidsflyt] med Git.', 'Нужно слово со значением «рабочий процесс».'),
        ('Firmaet kjører i Azure, så det er fint med kjennskap til [skytjenester].',
         'Нужно слово со значением «облачные сервисы».'),
        ('Taras [trives] med å samarbeide med andre.', 'Нужен глагол «чувствовать себя хорошо, нравиться».'),
    ], distractors=['pensjon', 'kontor']))

    rows = find('1A', 'it-1a-rg')
    if not any(r['id'] == '8' for r in rows['content']['rows']):
        rows['content']['rows'].append({'id': '8', 'text': 'Søkeren bør kjenne arbeidsflyten med pull requests.'})
    rows['expectedAnswers']['rows']['8'] = {'answer': 'c-riktig', 'why': 'Det er et av kravene i annonsen.',
                                            'quote': 'har brukt Git og forstår vanlig arbeidsflyt med pull requests'}

    # 1B — the stress note was wrong: «erfaring» is stressed on the first syllable (NAOB)
    focus = find('1B', 'it-1b-read')['expectedAnswers']['prompts']['p1']['focus']
    next(f for f in focus if f['word'] == 'erfaring')['note'] = 'Trykk på første staving: ER-fa-ring.'

    # 1B — a sixth pair, so the pool is not guessable by elimination
    replace('1B', 'it-1b-match', match('it-1b-match', 'Соедините начало и конец предложения по тексту 1B.', [
        ('En norsk CV bør', 'være kort og konkret.', 'Erik: én side, maks to, og vær konkret.'),
        ('Man unngår ofte bilde på CV-en', 'for å unngå ubevisst diskriminering.',
         'Bilde kan føre til at noen diskriminerer ubevisst.'),
        ('Erik anbefaler', 'en nøktern og direkte tone.', 'Nordmenn liker lite skryt.'),
        ('Taras bruker kulepunkter', 'i stedet for lange avsnitt.', 'Erik: «Bruk kulepunkter, ikke lange avsnitt.»'),
        ('Erik retter', 'noen få skrivefeil i søknaden.', 'Han leser gjennom og retter skrivefeil.'),
        ('Taras sender søknaden', 'samme kveld.', '«Send den i kveld, så venter du ikke unødvendig.»'),
    ]))

    # 1C — indirect speech is the topic of leksjon 6: replaced by the order of the interview
    drop('1C', 'it-1c-ind')
    after('1C', 'it-1c-rg', order(
        'it-1c-order', 'Расставьте события собеседования в том порядке, в каком они идут в тексте 1C.',
        'Tekst 1C — Jobbintervjuet.', [
            'Silje ringer og inviterer Taras til intervju.',
            'Taras møter opp på kontoret fem minutter før avtalt tid.',
            'Silje ber ham fortelle om bakgrunnen sin.',
            'Hun spør hvordan han stiller seg til å lære om sky.',
            'Taras forteller hvordan han har jobbet med databaser.',
            'De snakker om teamarbeid og tilbakemelding.',
            'Taras spør om en vanlig uke og om kontakten med kundene.',
            'Silje sier at de gir beskjed i løpet av uka.',
        ], 'Først invitasjonen og oppmøtet, så spørsmålene i den rekkefølgen Silje stiller dem: bakgrunn, sky, '
           'databaser, team og tilbakemelding. Til slutt spør Taras selv, og Silje forteller om veien videre.'))
    replace('1C', 'it-1c-gap', gap('it-1c-gap', RU_GAP, [
        ('Silje tar imot Taras med et fast [håndtrykk].', 'Нужно слово со значением «рукопожатие».'),
        ('Taras setter pris på [tilbakemelding], selv når den er kritisk.', 'Нужно слово со значением «обратная связь».'),
        ('Han har optimalisert en treg [spørring] mot databasen.', 'Нужно слово со значением «запрос к базе данных».'),
        ('Teamet starter dagen med et kort [standup-møte].', 'Нужно слово со значением «стендап-встреча».'),
        ('Silje liker Taras\' [holdning] til tilbakemelding.', 'Нужно слово со значением «отношение, позиция».'),
        ('Teamet samarbeider tett med [produkteieren], som snakker med kundene.',
         'Нужно слово со значением «владелец продукта» (определённая форма).'),
    ], distractors=['resepsjon', 'spørsmål']))
    find('1C', 'it-1c-interview')['expectedAnswers']['prompts']['p2']['note'] = (
        'Modell: «Jeg har litt kjennskap til … fra hobbyprosjekter, men det er noe jeg gjerne vil lære mer om. '
        'Jeg ser det som en mulighet.» Lytt etter: ærlig om svakhet + positiv vending; i leddsetningen står '
        '«gjerne» foran verbet («noe jeg gjerne vil lære»).')

    # 1D — the dates follow the story (deadline 20 August, so the start is in the autumn)
    call = find('1D', 'it-1d-call')
    call['content']['prompts'][2]['turn'] = {
        'situation': 'Du har oppsigelsestid i den nåværende jobben og kan først begynne 1. oktober.',
        'partner': 'Kunne du tenke deg å begynne allerede 1. september?'}
    call['expectedAnswers']['prompts']['p3']['note'] = (
        'Modell: «Det er dessverre litt vanskelig, fordi jeg har oppsigelsestid. Ville det være mulig å begynne '
        '1. oktober?» Lytt etter: myk avvisning («dessverre litt vanskelig») + høflig motforslag med «ville/kunne».')
    find('1D', 'it-1d-write')['expectedAnswers']['points']['p2']['keywords'] = [
        'takker ja', 'takker gjerne ja', 'ja til stillingen', 'aksepterer', 'tar imot tilbudet']
    # 1D — the questions no longer give an anchor of another question away
    prompts = {'sa1': 'Hvilket beløp foreslår Silje først?', 'sa3': 'Hva blir de enige om til slutt?', 'sa4': 'Hva annet endres i det nye tilbudet?',
               'sa5': 'Hva sier Erik om å forhandle i Norge?'}
    for q in find('1D', 'it-1d-sa')['content']['questions']:
        q['prompt'] = prompts.get(q['id'], q['prompt'])
    after('1D', 'it-1d-gap', gap('it-1d-recall', RU_RECALL, [
        ('Vi jobber [smidig] med Scrum.', 'Слово из 1A: «гибко, agile».', '', [], 'гибко, agile'),
        ('Jeg har [kjennskap] til skytjenester, men ikke lang erfaring.', 'Слово из 1A: «знакомство, общее представление».',
         '', [], 'знакомство, общее представление'),
        ('API-et [håndterer] 10 000 forespørsler i timen.', 'Глагол из 1B: «обрабатывает».', '', [], 'обрабатывает'),
        ('Han har utviklet og [vedlikeholdt] flere API-er.', 'Глагол из 1B в форме причастия: «поддерживал».',
         'å vedlikeholde — vedlikeholdt (perfektum partisipp).', [], 'поддерживал (в рабочем состоянии)'),
        ('Jeg [trives] med å jobbe i team.', 'Глагол на -s из 1A: «мне комфортно».', '', [], 'мне нравится, мне комфортно'),
        ('Hun har [optimalisert] en treg spørring.', 'Глагол из 1C в форме причастия.', '', [], 'оптимизировала'),
        ('Hver morgen har teamet et kort [standup-møte].', 'Слово из 1C: короткая встреча стоя.', '',
         ['standupmøte', 'standup'], 'стендап-встреча'),
        ('Firmaet tilbyr [hjemmekontor] to dager i uka.', 'Слово из 1A: «работа из дома».', '', [],
         'работа из дома'),
    ], free=True, title='Ord fra leksjon 1 — skriv selv'))

    # Grammar module: one right answer per item, no form marked wrong here and accepted elsewhere,
    # the three stages (choose → build → correct), no sentence in more than two tasks.
    ex['1'] = [d for d in ex['1'] if d['key'] in ('it-g1-mc2', 'it-g1-match', 'it-g1-essay')]
    choose = mc('it-g1-mc', 'Velg riktig form', 'Выберите единственно верную форму. Остальные варианты — ошибки.',
                'Velg formen som er riktig i setningen.', [
        ('Forsiktig spørsmål om lønn', 'Jeg lurte på ___ det var mulig å se på lønnen igjen.', ['om', 'at', 'hvis'], 0,
         '«Jeg lurte på om …» — et ja/nei-spørsmål i leddsetning innledes med «om».',
         {1: '«At» innleder en påstand, ikke et spørsmål.', 2: '«Hvis» er en betingelse («если»), ikke «ли».'}),
        ('Ordstilling etter «om»', 'Jeg lurte på om han ___ fått beskjeden.', ['ikke hadde', 'hadde ikke', 'ikke har hatt'], 0,
         'I leddsetning står «ikke» foran verbet: om han ikke hadde fått.',
         {1: 'Dette er ordstillingen i en hovedsetning.'}),
        ('Høflig ønske', 'Jeg vil gjerne ___ mer om teamet.', ['vite', 'å vite', 'vet'], 0,
         'Etter modalverb (vil) kommer infinitiv uten «å».', {1: 'Ikke «å» etter modalverb.'}),
        ('Høflig forespørsel', 'Ville det ___ mulig å jobbe hjemmefra to dager i uka?', ['være', 'er', 'å være'], 0,
         '«Ville det være mulig …» — modalverb + infinitiv uten «å».'),
        ('Å myke opp et krav', 'Jeg håpet ___ noe nærmere 660 000.', ['på', 'for', 'til'], 0,
         'Det heter «å håpe på noe».', {1: '«Håpe for» er påvirket av engelsk «hope for».'}),
        ('Indirekte spørsmål', 'Jeg lurte på hvordan ___ hjemmekontor.', ['dere praktiserer', 'praktiserer dere', 'dere praktisere'], 0,
         'I et indirekte spørsmål er det ingen inversjon: spørreord + subjekt + verb.',
         {1: 'Inversjon hører til det direkte spørsmålet: «Hvordan praktiserer dere …?»'}),
    ], kind='grammar')
    build_ = schema(
        'it-g1-ss', 'Jeg lurte på … — bygg leddsetningen',
        'Сделайте из прямого вопроса вежливый косвенный: продолжите «Jeg lurte på …» и разложите слова по полям.',
        'Gjør spørsmålet om til en leddsetning etter «Jeg lurte på …» og legg ordene i skjemaet.',
        'В придаточном нет инверсии, а ikke стоит перед глаголом: om/spørreord — subjekt — (ikke) — verb.', [
            ('«Har han ikke fått beskjeden?»',
             [('om', 'subjunksjon'), ('han', 'subjekt'), ('ikke', 'adverbial'), ('hadde', 'verbal'), ('fått', 'verbal'),
              ('beskjeden', 'sluttfelt')], ['hadde ikke', 'at'],
             'Вопрос «да/нет» вводится om; ikke встаёт перед глаголом: om han ikke hadde fått beskjeden.',
             {3: 'В придаточном ikke стоит ПЕРЕД глаголом.'}),
            ('«Hvor mye ferie gir stillingen?»',
             [('hvor mye ferie', 'subjunksjon'), ('stillingen', 'subjekt'), ('gir', 'verbal')], ['om', 'gir stillingen'],
             'Вопросительное слово само вводит придаточное, без om и без инверсии: hvor mye ferie stillingen gir.',
             {2: 'Подлежащее идёт перед глаголом — инверсии нет.'}),
            ('«Er det mulig å se på lønnen en gang til?»',
             [('om', 'subjunksjon'), ('det', 'subjekt'), ('var', 'verbal'), ('mulig', 'sluttfelt'),
              ('å se på lønnen', 'sluttfelt'), ('en gang til', 'sluttfelt')], ['er det', 'at'],
             'После «Jeg lurte på» вежливее сдвинуть время: er → var. Порядок: om + det + var.',
             {1: 'Вопрос «да/нет» вводится om, а не at.'}),
            ('«Når kan jeg begynne?»',
             [('når', 'subjunksjon'), ('jeg', 'subjekt'), ('kunne', 'verbal'), ('begynne', 'verbal')], ['kunne jeg', 'om'],
             'når + подлежащее + глагол: når jeg kunne begynne. kan → kunne делает вопрос мягче.',
             {2: 'Подлежащее идёт перед глаголом — инверсии нет.'}),
        ])
    correct = errors(
        'it-g1-err', 'В каждой фразе одна ошибка в вежливой конструкции. Найдите и исправьте её.',
        'Проверьте: порядок слов после «om», инфинитив без «å» после модального глагола, предлог после «håpe».',
        'Høflige konstruksjoner — finn feilen.', [
            ('Jeg lurte på om kunne du sende meg kontrakten.', 'Jeg lurte på om du kunne sende meg kontrakten.',
             'Ingen inversjon i leddsetning: «om du kunne», ikke «om kunne du».'),
            ('Jeg vil gjerne å høre mer om arbeidsrutinene.', 'Jeg vil gjerne høre mer om arbeidsrutinene.',
             'Etter modalverb står infinitiv uten «å».'),
            ('Vi håpet for et svar i løpet av uka.', 'Vi håpet på et svar i løpet av uka.',
             'Det heter «å håpe på noe».'),
            ('Ville det er mulig å begynne i oktober?', 'Ville det være mulig å begynne i oktober?',
             'Etter «ville» kommer infinitiv: «ville det være».'),
            ('Jeg lurte på om han hadde ikke fått e-posten.', 'Jeg lurte på om han ikke hadde fått e-posten.',
             'I leddsetning står «ikke» foran verbet.'),
        ])
    situations = next(d for d in ex['1'] if d['key'] == 'it-g1-mc2')
    pairs = match('it-g1-match', 'Соедините прямую фразу с её вежливым вариантом.', [
        ('Kan du sende CV-en?', 'Kunne du sende CV-en?', 'Kan → kunne.'),
        ('Jeg vil ha mer lønn.', 'Jeg håpet på noe høyere lønn.', 'Krav → «jeg håpet på».'),
        ('Er det mulig med hjemmekontor?', 'Ville det være mulig med hjemmekontor?', 'Er det → ville det være.'),
        ('Nei, det går ikke.', 'Det er dessverre litt vanskelig, men …', 'Myk avvisning.'),
        ('Det er for lite ferie.', 'Jeg håpet på litt mer ferie.', 'Klage → «jeg håpet på».'),
        ('Hva er lønnen?', 'Kan du si litt om lønnen?', 'Indirekte spørsmål.'),
    ], variant='pairs')
    essay = next(d for d in ex['1'] if d['key'] == 'it-g1-essay')
    ex['1'] = [choose, pairs, situations, build_, correct, essay]

    # Length tells: a right option much longer than the others is picked without reading
    def option(sub, key, qid, oid, text):
        q = next(q for q in find(sub, key)['content']['questions'] if q['id'] == qid)
        next(o for o in q['options'] if o['id'] == oid)['text'] = text
    option('1A', 'it-1a-mc', 'q2', 'b', 'å slutte i jobben')
    option('1A', 'it-1a-mc', 'q3', 'b', 'et kontorbygg med bare én etasje')
    option('1B', 'it-1b-mc', 'q5', 'c', 'forstår bare skriftlig tekst')
    option('1D', 'it-1d-mc', 'q1', 'a', 'å nekte å diskutere saken videre')
    q2, q3 = situations['content']['questions'][1:3]
    q2['options'][0]['text'], q2['options'][2]['text'] = 'Jeg er helt uenig med deg i det.', 'Du tar feil, og det vet du.'
    q3['options'][0]['text'], q3['options'][2]['text'] = 'Hvor mye ferie får jeg hos dere, da?', 'Jeg vil ha minst fem uker ferie.'

    # A quote that only repeats the statement shows nothing: quote the sentence it comes from
    def row(sub, key, rid, **kw):
        find(sub, key)['expectedAnswers']['rows'][rid].update(kw)
    row('1A', 'it-1a-rg', '3', quote='fordelt på tre team, og jobber smidig')
    row('1A', 'it-1a-rg', '5', quote='fleksibel arbeidstid og mulighet for hjemmekontor to dager i uka')
    row('1C', 'it-1c-rg', '2', why='Han er der før tiden, ikke etter.')
    row('1C', 'it-1c-rg', '5', quote='arbeidsrutinene, standup-møtene')
    row('1D', 'it-1d-rg', '2', quote='I tillegg får du fem uker ferie')
    row('1D', 'it-1d-rg', '3', quote='innskuddspensjon og mulighet for hjemmekontor')

    pend['1A'] = [listen('it-1a-listen', '1A', 'Lytt — Stillingsannonsen', [
        ('', 'Hvor fant Taras stillingsannonsen?', ['På Finn.no', 'På LinkedIn', 'Hos en venn'], 0,
         'Han scroller gjennom stillingsannonser på Finn.no.'),
        ('', 'Hva lover firmaet om skytjenester?', ['At de lærer deg opp underveis', 'At du må kunne Azure fra før', 'At de ikke bruker sky'], 0,
         '«… men vi lærer deg gjerne opp underveis.»'),
        ('', 'Hva tilbyr Erik å gjøre?', ['Å lese gjennom søknaden', 'Å skrive søknaden for Taras', 'Å ringe Silje Berg'], 0,
         '«Jeg kan lese gjennom den for deg etterpå.»'),
    ])]
    pend['1B'] = [listen('it-1b-listen', '1B', 'Lytt — CV og søknad', [
        ('', 'Hvor lang er en CV ofte i hjemlandet til Taras?', ['To-tre sider', 'Én side', 'Fem sider'], 0,
         'I hjemlandet er CV-en gjerne to-tre sider lang.'),
        ('', 'Hvilket eksempel på en konkret formulering gir Erik?', ['Et API som håndterer 10 000 forespørsler i timen', 'Fem års erfaring med Java', 'Et team på seks utviklere'], 0,
         '«utviklet et API som håndterer 10 000 forespørsler i timen»'),
        ('', 'Når sender Taras søknaden?', ['Med en gang, samme kveld', 'Dagen etter', 'Etter helgen'], 0,
         'Taras sender søknaden med en gang.'),
    ])]
    pend['1C'] = [listen('it-1c-listen', '1C', 'Lytt — Jobbintervjuet', [
        ('', 'Hvor foregår intervjuet?', ['På kontoret til Nordly Tech', 'På Teams', 'På telefon'], 0,
         'Taras velger å møte opp personlig.'),
        ('', 'Hva har Taras gjort med trege spørringer?', ['Optimalisert dem', 'Slettet dem', 'Sendt dem til en kollega'], 0,
         '«… jeg har optimalisert flere spørringer som var trege.»'),
        ('', 'Hvor mange kandidater til skal Silje snakke med?', ['To', 'Tre', 'Ingen'], 0,
         'De skal snakke med to kandidater til.'),
    ])]
    pend['1D'] = [
        listen('it-1d-listen', '1D', 'Lytt — Tilbudet', [
            ('', 'Hvor mange uker ferie får Taras?', ['Fem', 'Fire', 'Seks'], 0, 'I tillegg får du fem uker ferie.'),
            ('', 'Hvilken lønn håpet Taras på?', ['Rundt 660 000', 'Rundt 620 000', 'Rundt 700 000'], 0,
             '«… håpet jeg på noe nærmere 660 000.»'),
            ('', 'Når sender Silje kontrakten?', ['Samme dag', 'Neste uke', 'Etter fire måneder'], 0,
             '«Da sender jeg kontrakten i dag.»'),
        ]),
        dictation('it-1d-dict', 'Diktat — leksjon 1', 'Диктант по словам урока 1: слушайте и записывайте по одному предложению.', [
            ('Vi jobber smidig med Scrum.', 'smidig — med én d og -ig.', ['smidig']),
            ('Jeg har kjennskap til skytjenester.', 'kjennskap — kj-lyd og dobbel n; skytjenester i ett ord.',
             ['kjennskap', 'skytjenester']),
            ('Han har optimalisert en treg spørring.', 'spørring — dobbel r.', ['optimalisert', 'spørring']),
            ('Jeg lurte på om det ville være mulig.', 'Leddsetning etter «om»: det ville være.', ['lurte']),
            ('Firmaet tilbyr hjemmekontor to dager i uka.', 'hjemmekontor — stum h, dobbel m, i ett ord.',
             ['hjemmekontor']),
        ]),
    ]


# ═════════════════════════════════════════════════════════════════════════════
# Leksjon 2 — Første uker på jobb (G2: perfektum og preteritum)
# ═════════════════════════════════════════════════════════════════════════════
def unit2():
    vocab = {
        '2A': ('2A — Onboarding-programmet', [
            noun('onboarding', 'm', 'процесс адаптации новичка', 'onboardingen'),
            noun('nyansatt', 'm', 'новый сотрудник', 'den nyansatte', 'nyansatte', 'de nyansatte'),
            noun('bærbar PC', 'm', 'ноутбук', 'den bærbare PC-en', 'bærbare PC-er', 'de bærbare PC-ene'),
            noun('tilgang', 'm', 'доступ', 'tilgangen', 'tilganger', 'tilgangene'),
            noun('kodebase', 'm', 'кодовая база', 'kodebasen', 'kodebaser', 'kodebasene'),
            noun('buddy', 'm', '«бадди», сопровождающий коллега для новичка', 'buddyen', 'buddyer', 'buddyene'),
            noun('utviklingsmiljø', 'n', 'среда разработки', 'utviklingsmiljøet', 'utviklingsmiljøer', 'utviklingsmiljøene'),
            verb('klone (et prosjekt)', 'клонировать (проект)', 'kloner', 'klonet', 'klonet'),
            other('gradvis', 'постепенно', 'ADVERB'),
        ]),
        '2B': ('2B — Å bli kjent med teamet', [
            noun('strømmetjeneste', 'm', 'стриминговый сервис', 'strømmetjenesten', 'strømmetjenester', 'strømmetjenestene'),
            other('uskreven regel', 'неписаное правило'),
        ]),
        '2C': ('2C — Kontorkultur og forventninger', [
            noun('klesstil', 'm', 'стиль одежды', 'klesstilen', 'klesstiler', 'klesstilene'),
            adj('avslappet', 'расслабленный', 'avslappet', 'avslappede'),
            noun('hierarki', 'n', 'иерархия', 'hierarkiet', 'hierarkier', 'hierarkiene'),
            noun('begrunnelse', 'm', 'обоснование', 'begrunnelsen', 'begrunnelser', 'begrunnelsene'),
            noun('tillit', 'm', 'доверие', 'tilliten'),
            verb('stå fast', 'застрять (на задаче)', 'står fast', 'sto fast', 'stått fast'),
            other('til gjengjeld', 'взамен, в свою очередь'),
        ]),
        '2D': ('2D — Prøvetiden og den første tilbakemeldingen', [
            noun('prøvetid', 'm', 'испытательный срок', 'prøvetiden', 'prøvetider', 'prøvetidene'),
            noun('oppfølgingsmøte', 'n', 'контрольная встреча', 'oppfølgingsmøtet', 'oppfølgingsmøter', 'oppfølgingsmøtene'),
            noun('evaluering', 'm', 'оценка', 'evalueringen', 'evalueringer', 'evalueringene'),
            verb('levere (det man har lovet)', 'выполнить (обещанное)', 'leverer', 'leverte', 'levert'),
            noun('observasjon', 'm', 'наблюдение', 'observasjonen', 'observasjoner', 'observasjonene'),
            noun('dokumentasjon', 'm', 'документация', 'dokumentasjonen'),
        ]),
    }

    a = [
        sa('it-2a-sa', '2A', 'Husker du teksten? — 2A', RU_SA.format('2A'), [
            ('Hva får Taras den første dagen?', [['pc', 'datamaskin'], ['tilgang', 'slack', 'github']],
             'En bærbar PC, tilgang til Slack og GitHub, og en liste over systemene teamet bruker.',
             'Det står i avsnittet om onboarding-programmet.', 'Første dag får'),
            ('Hva er en «buddy» hos Nordly Tech?', [['kollega', 'kollegaen'], ['spørsmål', 'hjelper', 'hjelpe']],
             'En kollega som skal svare på spørsmål de første ukene.', '«… en kollega som skal svare på spørsmål de første ukene.»',
             'en kollega som skal svare'),
            ('Hva gjør Taras og Ingrid resten av formiddagen?', [['installere', 'installerer', 'programvare', 'kloner', 'klone']],
             'De installerer programvare og kloner prosjektene.', 'De bruker formiddagen på å installere programvare og klone prosjektene.',
             'De bruker resten av formiddagen'),
            ('Hva forventer Silje av Taras de første tre månedene?', [['kodebasen', 'kodebase'], ['standup-møtene', 'standup', 'oppgaver']],
             'At han blir kjent med kodebasen, deltar i standup-møtene og gradvis tar på seg egne oppgaver.',
             'Silje går gjennom forventningene etter lunsj.', 'forventningene til de første tre månedene'),
            ('Hva får Taras en egen gjennomgang av neste uke?', [['azure', 'sky', 'skytjenester']],
             'Av Azure-oppsettet, fordi han bare har litt kjennskap til skytjenester.',
             '«… får du en egen gjennomgang av Azure-oppsettet vårt neste uke.»', 'Azure-oppsettet'),
        ]),
        rg('it-2a-rg', '2A', 'Onboarding-programmet', [
            ('Taras er ikke nervøs i det hele tatt den første dagen.', False, 'Han gleder seg, men er også litt nervøs.', 'er også litt nervøs'),
            ('Ingrid er buddyen til Taras de første tre ukene.', True, 'Ingrid sier det selv.', 'Jeg er buddyen din de neste tre ukene'),
            ('Silje viser Taras rundt på kontoret.', True, 'Hun viser ham kjøkkenet, møterommene og plassen hans.', 'Hun viser ham rundt på kontoret'),
            ('Møtet om forventninger er før lunsj.', False, 'Møtet er etter lunsj.', 'Etter lunsj har Taras et møte med Silje'),
            ('Taras må kunne alt fra første dag.', False, 'Silje sier det motsatte.', 'Ingen forventer at du kan alt fra første dag'),
            ('Taras synes kollegaene har vært hyggelige.', True, 'Det tenker han om ettermiddagen.', 'alle har vært hyggelige og hjelpsomme'),
        ]),
        mc('it-2a-mc', 'Hva betyr ordet? — 2A', RU_MC.format('2A'), NB_MC, [
            ('Han får også en «buddy».', 'en buddy', ['en sjef for hele avdelingen', 'en kollega som hjelper en nyansatt', 'en kunde'], 1,
             'En buddy følger opp den nye kollegaen de første ukene.'),
            ('… gradvis ta på seg egne oppgaver.', 'gradvis', ['plutselig', 'litt etter litt', 'aldri'], 1,
             'Gradvis = steg for steg, litt etter litt.'),
            ('Først setter vi opp utviklingsmiljøet ditt.', 'et utviklingsmiljø', ['et kontor der utviklerne sitter', 'verktøyene og oppsettet man koder i', 'et møterom'], 1,
             'Utviklingsmiljø: editor, verktøy og oppsett på maskinen.'),
            ('et fast onboarding-program for nyansatte', 'en nyansatt', ['en som nettopp har begynt i jobben', 'en som nylig har sluttet i jobben', 'en leder'], 0,
             'Nyansatt = ny + ansatt.'),
            ('tilgang til Slack og GitHub', 'en tilgang', ['en regning for noe', 'en rett til å bruke noe', 'en oppgave'], 1,
             'Har du tilgang, kan du logge inn og bruke systemet.'),
        ]),
        gap('it-2a-gap', RU_GAP, [
            ('Nordly Tech har et fast program for [nyansatte].', 'Нужно слово «новые сотрудники» (мн. число).'),
            ('Taras får [tilgang] til Slack og GitHub.', 'Нужно слово со значением «доступ».'),
            ('Ingrid viser ham [kodebasen].', 'Нужно слово «кодовая база» в определённой форме.'),
            ('Først setter de opp [utviklingsmiljøet] hans.', 'Нужно слово «среда разработки» в определённой форме.'),
            ('Han skal [gradvis] ta på seg egne oppgaver.', 'Нужно наречие «постепенно».'),
            ('Første dag får han en [bærbar] PC.', 'Нужно прилагательное «переносной»: ноутбук.'),
        ], distractors=['kantina', 'fristen']),
    ]
    b = [
        sa('it-2b-sa', '2B', 'Husker du teksten? — 2B', RU_SA.format('2B'), [
            ('Hvor spiser teamet lunsj?', [['kantina', 'kantinen', 'kantine']], 'I kantina, der alle sitter rundt samme bord.',
             '«I kantina sitter alle rundt samme bord.»', 'I kantina sitter alle'),
            ('Hvor kommer Mohammed fra, og når flyttet han til Norge?', [['egypt'], ['fem år', '5 år']],
             'Han kommer fra Egypt og flyttet til Norge for fem år siden.', '«Jeg flyttet hit fra Egypt for fem år siden.»',
             'Jeg flyttet hit fra Egypt'),
            ('Hva snakker teamet om i lunsjen?', [['helgen', 'hytta', 'serier', 'strømmetjenester', 'vanlige ting']],
             'Om vanlige ting som helgen, hytta og serier — ikke om jobb.', 'Ingen snakker om jobb under lunsjen.',
             'Samtalen fortsetter'),
            ('Hvordan er teamet organisert?', [['tre utviklere', 'utviklere'], ['qa-ingeniør', 'qa', 'produkteier']],
             'Tre utviklere, én QA-ingeniør og en produkteier.', 'Ingrid forklarer det etter lunsj.', 'hvordan teamet er organisert'),
            ('Hva gjør man hvis man lurer på noe hos Silje?', [['banke', 'banker']],
             'Man kan bare banke på hos henne, uten et stort møte.', '«Du kan bare banke på hos Silje hvis du lurer på noe.»',
             'banke på hos Silje'),
        ]),
        match('it-2b-match', 'Соедините начало и конец предложения по тексту 2B.', [
            ('Taras er opprinnelig', 'fra Ukraina.', '«Jeg er opprinnelig fra Ukraina.»'),
            ('Mohammed flyttet til Norge', 'for fem år siden.', '«… fra Egypt for fem år siden.»'),
            ('Under lunsjen snakker ingen', 'om jobb.', 'Lunsjen er en pause fra arbeidsoppgavene.'),
            ('Teamet har standup', 'hver morgen klokka ni.', 'Det forklarer Ingrid etter lunsj.'),
            ('Et lengre planleggingsmøte holdes', 'hver mandag.', '«… et lengre planleggingsmøte hver mandag.»'),
            ('Lunsjen på mandager', 'prøver alle å være med på.', 'Det sier Silje.'),
        ]),
        mc('it-2b-mc', 'Hva betyr ordet? — 2B', RU_MC.format('2B'), NB_MC, [
            ('det virker som en uskreven regel', 'en uskreven regel', ['en lov som står i arbeidsmiljøloven', 'en regel alle følger uten at den står skrevet', 'en feil'], 1,
             'Uskreven = ikke skrevet ned, men alle kjenner den.'),
            ('Teamet virker inkluderende.', 'inkluderende', ['som holder folk utenfor', 'som tar godt imot nye', 'dyr'], 1,
             'Et inkluderende team slipper nye folk inn.'),
            ('… begynner å slappe litt mer av.', 'å slappe av', ['å bli stresset', 'å bli rolig', 'å jobbe hardere'], 1,
             'Å slappe av = å bli avslappet.'),
            ('hvor er du fra opprinnelig?', 'opprinnelig', ['fra begynnelsen av', 'for tiden', 'snart'], 0,
             'Opprinnelig = der du kommer fra fra først av.'),
        ]),
        gap('it-2b-gap', RU_GAP, [
            ('Teamet spiser lunsj i [kantina].', 'Нужно слово «столовая» в определённой форме.'),
            ('Taras er [opprinnelig] fra Ukraina.', 'Нужно наречие «родом, изначально».'),
            ('Det er en [uskreven] regel at man ikke snakker jobb i lunsjen.', 'Нужно прилагательное «неписаный».'),
            ('En [produkteier] jobber tett med kundene.', 'Нужно слово «владелец продукта».'),
            ('Mange jobber på [hjemmekontor] én eller to dager i uka.', 'Слово из урока 1: «работа из дома».'),
            ('Silje vil at folk skal [trives] på jobben.', 'Глагол из урока 1: «чувствовать себя хорошо».'),
        ], distractors=['hytta', 'resepsjonen']),
        speak('it-2b-speak', 'dialogue', 'Lunsjprat med teamet',
              'Обед с командой: ответьте коллегам устно, о себе. Следите за временем глагола: что было однажды — preteritum, опыт «до сих пор» — perfektum.',
              'Du spiser lunsj med teamet. Svar muntlig på spørsmålene om deg selv.', [
                  {'label': 'Hvor er du fra?', 'situation': 'Lunsj i kantina, første uke i ny jobb.',
                   'partner': 'Så, hvor er du fra opprinnelig?', 'seconds': (5, 30, 10),
                   'note': 'Modell: «Jeg er opprinnelig fra …, men jeg har bodd i Norge i … år.» Lytt etter: «har bodd … i» (perfektum om noe som varer fram til nå).'},
                  {'label': 'Å bo i Norge', 'situation': 'Lunsj i kantina, første uke i ny jobb.',
                   'partner': 'Hvordan synes du det er å bo her sammenlignet med hjemme?', 'seconds': (10, 45, 15),
                   'note': 'Modell: «Det er ganske annerledes. Her er det …, mens hjemme …» Lytt etter: én konkret forskjell og et bindeord (mens, men, spesielt).'},
                  {'label': 'Helgen', 'situation': 'Mandag i kantina.', 'partner': 'Hva gjorde du i helgen?',
                   'seconds': (8, 40, 10),
                   'note': 'Modell: «På lørdag gikk jeg en tur, og på søndag så jeg en serie.» Lytt etter: preteritum (gikk, så, var) — helgen er avsluttet.'},
                  {'label': 'Erfaring', 'situation': 'Mandag i kantina.', 'partner': 'Har du vært på hytte i Norge noen gang?',
                   'seconds': (5, 30, 10),
                   'note': 'Modell: «Ja, jeg har vært på hytte én gang, i fjor vinter.» / «Nei, det har jeg ikke, men jeg har lyst.» Lytt etter: perfektum i svaret (har vært), preteritum hvis tidspunktet nevnes.'},
              ], [('content_self', 2),
                  (('lang', 'Språk og verbtid', 'Perfektum om erfaring fram til nå, preteritum om avsluttet tid.',
                    ['Verbtiden gjør svaret vanskelig å forstå.', 'Blander perfektum og preteritum gjennomgående.',
                     'Riktig verbtid i de fleste setningene; noen feil i form.',
                     'Riktig valg av perfektum og preteritum, riktig partisipp.']), 1),
                  ('pron', 2), ('flow', 1)], 11),
    ]
    c = [
        sa('it-2c-sa', '2C', 'Husker du teksten? — 2C', RU_SA.format('2C'), [
            ('Hvordan kler folk seg hos Nordly Tech?', [['uformell', 'uformelt', 'genser', 'ingen dress', 'ikke dress']],
             'Klesstilen er uformell: genser og bukser, ingen dress.', '«Klesstilen er uformell …»', 'Klesstilen er uformell'),
            ('Hva gjør man hvis man blir forsinket til et møte?', [['sier ifra', 'si ifra', 'gir beskjed', 'gi beskjed']],
             'Man sier ifra på forhånd.', 'Det forventes at man sier ifra på forhånd.', 'sier ifra på forhånd'),
            ('Hvordan svarer Silje på spørsmålet om budsjettet?', [['åpent', 'åpen', 'begrunnelsen', 'forklarte', 'forklarer']],
             'Hun svarer åpent og forklarer begrunnelsen.', '«… svarte hun åpent og forklarte begrunnelsen.»',
             'forklarte begrunnelsen'),
            ('Hva bør man gjøre hvis man står fast med en oppgave?', [['tidlig', 'med en gang', 'straks']],
             'Man bør si ifra tidlig, i stedet for å vente til fristen nærmer seg.', 'Det er bedre å oppklare en misforståelse tidlig.',
             'Man forventes å si ifra tidlig'),
            ('Hva handler kontorkulturen mye om?', [['tillit', 'stoler']],
             'Om tillit mellom sjefen og de ansatte.', '«… kontorkulturen handler mye om tillit.»', 'handler mye om tillit'),
        ]),
        rg('it-2c-rg', '2C', 'Kontorkultur og forventninger', [
            ('De fleste hos Nordly Tech går i dress.', False, 'De fleste går i genser og bukser.', 'ingen bruker dress'),
            ('Møtene starter presis.', True, 'Selv om stemningen ellers er avslappet.', 'møter starter presis på minuttet'),
            ('Silje ble overrasket over spørsmålet om budsjett.', False, 'Hun virket ikke overrasket.', 'hun virket ikke overrasket'),
            ('Det er lite hierarki i praksis.', True, 'Det legger Taras merke til.', 'hvor lite hierarki det er i praksis'),
            ('Uenighet tar man helst opp i gangen etter møtet.', False, 'Uenighet håndteres direkte og saklig.', 'ikke i gangen etterpå'),
            ('Sjefen kontrollerer de ansatte hele tiden.', False, 'Sjefen stoler på de ansatte.', 'uten mye kontroll'),
        ]),
        mc('it-2c-mc', 'Hva betyr ordet? — 2C', RU_MC.format('2C'), NB_MC, [
            ('hvor lite hierarki det er i praksis', 'et hierarki', ['et system helt uten nivåer og sjefer', 'et system med nivåer av makt og ansvar', 'et møterom'], 1,
             'Hierarki: sjefer over sjefer. Flat struktur er det motsatte.'),
            ('hvis man står fast med en oppgave', 'å stå fast', ['å være ferdig', 'å ikke komme videre', 'å stå opp tidlig'], 1,
             'Står du fast, kommer du ikke videre uten hjelp.'),
            ('kontorkulturen handler mye om tillit', 'tillit', ['mistanke om at andre gjør feil', 'tro på at andre gjør det de skal', 'frykt'], 1,
             'Tillit = man stoler på hverandre.'),
            ('forklarte begrunnelsen', 'en begrunnelse', ['en forklaring på hvorfor', 'en unnskyldning', 'en regning'], 0,
             'Begrunnelse = grunnen til en beslutning.'),
            ('og til gjengjeld er ansatte åpne', 'til gjengjeld', ['dessverre, uheldigvis', 'som svar på det, i bytte', 'for sent'], 1,
             'Sjefen gir tillit, og til gjengjeld er de ansatte ærlige.'),
        ]),
        gap('it-2c-gap', RU_GAP, [
            ('Klesstilen på kontoret er [uformell].', 'Нужно прилагательное «неформальный».'),
            ('Møtene starter [presis] på minuttet.', 'Нужно слово «точно, вовремя».'),
            ('Det er lite [hierarki] i praksis hos Nordly Tech.', 'Нужно слово «иерархия».'),
            ('Silje forklarte [begrunnelsen] for budsjettet.', 'Нужно слово «обоснование» в определённой форме.'),
            ('Kulturen handler mye om [tillit].', 'Нужно слово «доверие».'),
            ('Man bør si ifra før en [frist] nærmer seg.', 'Нужно слово «срок, дедлайн».'),
        ], distractors=['dress', 'kontroll']),
        speak('it-2c-read', 'read', 'Les høyt — kontorkultur',
              'Прочитайте вслух два отрывка из текста 2C. Можно записать до трёх дублей.',
              'Les teksten høyt og tydelig. Du kan ta opp inntil tre ganger.', [
                  {'label': 'Uskrevne forventninger', 'seconds': (12, 50, 20),
                   'text': 'Samtidig er det noen uskrevne forventninger. Man forventes å si ifra tidlig hvis man står fast med en oppgave, i stedet for å vente til fristen nærmer seg — det er bedre å oppklare en misforståelse tidlig enn å bygge feil ting.',
                   'focus': [('forventninger', 'Trykk på andre staving: for-VENT-ninger.'),
                             ('misforståelse', 'Trykk på første staving: MIS-forståelse.'),
                             ('oppgave', 'Trykk på første staving: OPP-gave.')],
                   'note': 'Teksten er modellsvaret. Lytt etter pause ved kommaene og at «si ifra» leses sammen.'},
                  {'label': 'Silje om åpenhet', 'seconds': (8, 40, 20),
                   'text': 'Ja, vi prøver å være åpne om det meste. Vi tror folk jobber bedre når de forstår hvorfor vi gjør ting, ikke bare hva de skal gjøre.',
                   'focus': [('hvorfor', 'Stum h: «vorfor».'), ('gjør', 'gj uttales som j: «jør».'),
                             ('hva', 'Stum h: «va».')],
                   'note': 'Teksten er modellsvaret. Lytt etter trykk på «hvorfor» og «hva» — det er kontrasten i setningen.'},
              ], [('pron', 2), ('flow', 1), ('acc', 1)], 7),
    ]
    d = [
        sa('it-2d-sa', '2D', 'Husker du teksten? — 2D', RU_SA.format('2D'), [
            ('Hvor lang prøvetid er vanlig i Norge?', [['seks måneder', 'seks måneders', '6 måneder']],
             'Seks måneder.', '«… vanlig med seks måneders prøvetid.»', 'seks måneders prøvetid'),
            ('Hva har Taras gjort de første ukene?', [['oppgaver', 'spørring', 'lært']],
             'Han har lært mye og jobbet med to mindre oppgaver, blant annet optimaliserte han en treg spørring.',
             'Det forteller han selv til Silje.', 'Jeg har lært mye'),
            ('Hva synes Taras er vanskelig?', [['gamle systemet', 'dokumentasjonen', 'dokumentasjon']],
             'Å forstå deler av det gamle systemet, fordi dokumentasjonen ikke alltid er oppdatert.',
             '«… dokumentasjonen er ikke alltid oppdatert.»', 'dokumentasjonen er ikke alltid oppdatert'),
            ('Hva foreslår Silje?', [['notere', 'notater', 'notatene', 'skrive ned']],
             'At Taras skal notere det han finner ut, så de forbedrer dokumentasjonen underveis.',
             '«Kanskje du kan begynne å notere det du finner ut …»', 'begynne å notere'),
            ('Når er det neste møtet?', [['seks uker', '6 uker']], 'Om seks uker.', '«… neste gang om seks uker.»',
             'neste gang om seks uker'),
        ]),
        rg('it-2d-rg', '2D', 'Prøvetiden og den første tilbakemeldingen', [
            ('Prøvetiden i Norge er vanligvis tre måneder.', False, 'Det er vanlig med seks måneder.', 'seks måneders prøvetid'),
            ('Taras har optimalisert en treg spørring.', True, 'Det nevner han som eksempel.', 'optimaliserte jeg en treg spørring'),
            ('Silje er misfornøyd med de tekniske ferdighetene hans.', False, 'Hun sier at de er gode.', 'De tekniske ferdighetene dine er gode'),
            ('Dokumentasjonen er alltid oppdatert.', False, 'Det er nettopp det som er problemet.', 'dokumentasjonen er ikke alltid oppdatert'),
            ('Taras har allerede begynt å skrive notater.', True, 'Han skriver notater til seg selv.', 'Jeg har allerede begynt å skrive litt notater'),
            ('Tilbakemeldingen kommer bare én gang, til slutt.', False, 'De har korte møter underveis.', 'ikke bare én stor evaluering til slutt'),
        ]),
        gap('it-2d-gap', RU_GAP, [
            ('I Norge er det vanlig med seks måneders [prøvetid].', 'Нужно слово «испытательный срок».'),
            ('Taras har [levert] det han har lovet.', 'Нужен глагол «выполнить, сдать» в форме причастия.'),
            ('[Dokumentasjonen] er ikke alltid oppdatert.', 'Нужно слово «документация» в определённой форме.'),
            ('Silje gir konkret og ærlig [tilbakemelding].', 'Слово из урока 1: «обратная связь».'),
            ('Han vil [strukturere] notatene sine.', 'Глагол из урока 1: «структурировать».'),
            ('Etter tre uker har de et [oppfølgingsmøte].', 'Нужно слово «контрольная встреча».'),
        ], distractors=['evalueringen', 'fristen']),
        gap('it-2d-recall', RU_RECALL, [
            ('Som [nyansatt] får Taras en buddy.', 'Слово из 2A: «новый сотрудник».', '', [], 'новый сотрудник'),
            ('Han har fått [tilgang] til Slack og GitHub.', 'Слово из 2A: «доступ».', '', [], 'доступ'),
            ('Ingrid viser ham [kodebasen].', 'Слово из 2A в определённой форме.', '', ['kodebase'], 'кодовая база'),
            ('Han skal [gradvis] ta på seg egne oppgaver.', 'Наречие из 2A.', '', [], 'постепенно'),
            ('Silje forklarer [begrunnelsen] for beslutningen.', 'Слово из 2C в определённой форме.', '', ['begrunnelse'], 'обоснование'),
            ('[Prøvetiden] varer i seks måneder.', 'Слово из 2D в определённой форме.', '', ['prøvetida', 'prøvetid'], 'испытательный срок'),
            ('Du har [levert] det du har lovet.', 'Глагол из 2D в форме причастия.', 'å levere — leverte — har levert.', [], 'выполнил, сдал'),
            ('[Dokumentasjonen] er ikke oppdatert.', 'Слово из 2D в определённой форме.', '', ['dokumentasjon'], 'документация'),
        ], free=True, title='Ord fra leksjon 2 — skriv selv'),
        match('it-2d-rep', 'Повторение слов урока 1: соедините слово с его объяснением.', [
            ('smidig', 'fleksibel, i korte runder', 'Smidig utvikling = agile.'),
            ('en forespørsel', 'det man ber et system eller en person om', 'Et API håndterer forespørsler.'),
            ('å vedlikeholde', 'å holde noe i orden over tid', 'Man vedlikeholder kode og systemer.'),
            ('en ferdighet', 'noe man kan gjøre godt', 'Ferdigheter står nederst i CV-en.'),
            ('kjennskap til noe', 'å vite litt om noe', 'Kjennskap er mindre enn erfaring.'),
            ('en spørring', 'et spørsmål til en database', 'En treg spørring kan optimaliseres.'),
            ('å håndtere', 'å ta seg av, behandle', 'Systemet håndterer 10 000 forespørsler.'),
        ], variant='pairs'),
        speak('it-2d-talk', 'monologue', 'Oppfølgingsmøtet — fortell om de første ukene',
              'Встреча с руководителем: расскажите о своих первых неделях на новой работе или курсе (60–90 секунд). Итог «на сегодня» — perfektum, конкретный случай — preteritum.',
              'Du har oppfølgingsmøte med lederen din. Fortell om de første ukene dine i en ny jobb eller på et nytt kurs.', [
                  {'label': 'Hvordan har de første ukene vært?', 'seconds': (40, 90, 45),
                   'plan': [('Hva du har lært så langt', True), ('Hva du har jobbet med eller levert', True),
                            ('Én konkret episode: hva skjedde, og når', True), ('Hva som har vært vanskelig', True),
                            ('Hva du vil gjøre videre', False)],
                   'note': 'Modell: «Jeg har lært mye om kodebasen, og jeg har fått god hjelp av kollegaene. Jeg har jobbet med to mindre oppgaver. På mandag optimaliserte jeg en treg spørring, og den ble ferdig i går. Det har vært litt vanskelig å forstå det gamle systemet, fordi dokumentasjonen ikke er oppdatert. Jeg vil gjerne fortsette å skrive notater.» Lytt etter: perfektum i oppsummeringen (har lært, har jobbet), bytte til preteritum i episoden (på mandag …, i går …).'},
              ], [('content_plan', 2),
                  (('lang', 'Språk og verbtid', 'Perfektum i oppsummeringen, preteritum i den konkrete episoden.',
                    ['Verbtiden gjør fortellingen vanskelig å følge.', 'Bare én verbtid, eller gjennomgående feil i partisipp.',
                     'Begge verbtidene er med, med enkelte feil.',
                     'Trygt bytte mellom perfektum og preteritum, riktige former.']), 2),
                  ('pron', 1), ('flow', 1)], 11),
        write('it-2d-write', 'letter', 'Напишите руководителю короткий e-mail перед встречей: итог ваших первых недель (60–90 слов).',
              'Skriv en kort e-post (60–90 ord).',
              'Du har jobbet tre uker i en ny jobb. I morgen har du oppfølgingsmøte med lederen din, Silje. Skriv en kort e-post der du oppsummerer de første ukene: hva du har lært, hva du har levert, og hva som har vært vanskelig. Kom med ett forslag. Bruk perfektum når du oppsummerer.',
              [('Hva du har lært', ['har lært', 'kodebasen', 'systemet']),
               ('Hva du har levert eller jobbet med', ['har levert', 'har jobbet', 'oppgaver']),
               ('Hva som har vært vanskelig', ['vanskelig', 'har hatt', 'dokumentasjonen']),
               ('Ett forslag', ['foreslår', 'kanskje', 'kunne'])],
              ['Hei Silje,', 'De første ukene har …', 'Jeg har lært …', 'Det har vært litt vanskelig å …', 'Kanskje vi kunne …', 'Mvh'],
              [('Oppgaveløsning', 'Lært, levert, vanskelig og ett forslag.', 2, 'points',
                ['Ikke en oppsummering.', 'Ett–to punkter.', 'Tre punkter.', 'Alle fire punktene, konkret.']),
               ('Struktur og sammenheng', 'Hilsen, kort hoveddel, avslutning.', 1, 'paragraphs', W_STRUCT),
               ('Språklig korrekthet', 'Perfektum i oppsummeringen; riktig partisipp og ordstilling.', 1, 'language',
                ['Ingen perfektum; mange feil.', 'Perfektum med gjennomgående feil i partisipp.',
                 'Perfektum stort sett riktig; enkelte feil.', 'Perfektum riktig brukt i hele oppsummeringen.']),
               ('Ordforråd og rettskriving', 'Ord fra leksjonen (tilgang, kodebase, levere, dokumentasjon, gradvis), riktig stavet.', 1, 'lexis', W_LEXIS)],
              (60, 90), 9,
              'Hei Silje,\n\nDe første ukene har vært gode. Jeg har fått tilgang til alle systemene, og jeg har lært mye om kodebasen. Jeg har levert to mindre oppgaver, og jeg har gradvis begynt å ta egne oppgaver i sprinten.\n\nDet har vært litt vanskelig å forstå det gamle systemet, fordi dokumentasjonen ikke er oppdatert. Kanskje jeg kunne skrive ned det jeg finner ut, slik at neste nyansatt får det lettere?\n\nMvh\nTaras',
              recipient='Silje Berg, teamleder'),
    ]
    g = [
        mc('it-g2-mc', 'Perfektum eller preteritum?', 'Выберите единственно верную форму. Смотрите на маркер времени.',
           'Velg formen som er riktig i setningen.', [
               ('«Så langt» — resultat fram til nå', 'Jeg ___ med to oppgaver så langt.', ['har jobbet', 'jobbet', 'har jobbe'], 0,
                '«Så langt» peker på tiden fram til nå → perfektum.', {1: 'Preteritum trenger et avsluttet tidspunkt (i går, på mandag).'}),
               ('«I går» — bestemt tidspunkt', 'Han ___ å skrive notater i går.', ['begynte', 'har begynt', 'har begynte'], 0,
                '«I går» er et avsluttet tidspunkt → preteritum.', {1: 'Perfektum kan ikke stå sammen med «i går».'}),
               ('«Til nå»', 'Vi ___ god fremgang hos deg til nå.', ['har sett', 'så', 'har så'], 0,
                '«Til nå» → perfektum: har + partisipp (sett).', {2: 'Etter «har» kommer partisipp (sett), ikke preteritum (så).'}),
               ('«Klokka tre» — bestemt tidspunkt', 'Hun ___ rapporten klokka tre.', ['leverte', 'har levert', 'har leverte'], 0,
                'Et klokkeslett er et bestemt tidspunkt → preteritum.'),
               ('Plassering av «allerede»', 'Jeg ___ mye om kodebasen.', ['har allerede lært', 'har lært allerede', 'allerede har lært'], 0,
                'I hovedsetning står adverbet etter det finitte verbet: har allerede lært.'),
               ('Spørsmål om erfaring', '___ du jobbet med Git fra før?', ['Har', 'Er', 'Gjorde'], 0,
                'Spørsmål om erfaring uten tidspunkt: «Har du jobbet …?»'),
               ('«I 2019» — bestemt tidspunkt', 'Jeg ___ Git på studiet i 2019.', ['lærte', 'har lært', 'har lærte'], 0,
                'Et årstall er et bestemt tidspunkt → preteritum.', {1: 'Perfektum kan ikke stå sammen med «i 2019».'}),
           ], kind='grammar'),
        gap('it-g2-form', 'Впишите глагол в нужной форме: perfektum или preteritum. Инфинитив дан в подсказке.', [
            ('Jeg har [lært] mye om systemet så langt.', '«Så langt» → perfektum: нужна форма причастия.', 'å lære — har lært.', [], 'å lære'),
            ('På mandag [satte] vi opp utviklingsmiljøet.', '«På mandag» — определённое время → preteritum.', 'å sette — satte — har satt.', [], 'å sette'),
            ('Du har [stilt] gode spørsmål i standup-møtene til nå.', '«Til nå» → perfektum: нужна форма причастия.', 'å stille — stilte — har stilt.', [], 'å stille'),
            ('I går [optimaliserte] jeg en treg spørring.', '«I går» → preteritum.', 'å optimalisere — optimaliserte.', [], 'å optimalisere'),
            ('Vi har [sett] god fremgang hos deg så langt.', '«Så langt» → perfektum: нужна форма причастия.', 'å se — så — har sett.', [], 'å se'),
            ('Jeg [begynte] hos Nordly Tech for tre uker siden.', '«For tre uker siden» → preteritum.', 'å begynne — begynte — har begynt.', [], 'å begynne'),
        ], free=True, title='Sett verbet i riktig form',
            hint='«Så langt», «til nå», «allerede» → perfektum. «I går», «på mandag», «for … siden» → preteritum.'),
        errors('it-g2-err', 'В каждом предложении одна ошибка во времени глагола. Найдите и исправьте её.',
               'Определённое время в прошлом (i går, på mandag, for … siden) — preteritum; «до сих пор» — perfektum.',
               'Perfektum og preteritum — finn feilen.', [
                   ('Jeg har begynt i jobben for tre uker siden.', 'Jeg begynte i jobben for tre uker siden.',
                    '«For tre uker siden» er et bestemt tidspunkt → preteritum.'),
                   ('Vi har satt opp utviklingsmiljøet på mandag.', 'Vi satte opp utviklingsmiljøet på mandag.',
                    '«På mandag» er et bestemt tidspunkt → preteritum.'),
                   ('Jeg lærte mye om kodebasen så langt.', 'Jeg har lært mye om kodebasen så langt.',
                    '«Så langt» → perfektum.'),
                   ('Hun har levert rapporten klokka tre i går.', 'Hun leverte rapporten klokka tre i går.',
                    'Et klokkeslett i går er et bestemt tidspunkt → preteritum.'),
                   ('Har du jobbe med Git fra før?', 'Har du jobbet med Git fra før?',
                    'Etter «har» kommer partisipp: jobbet.'),
               ]),
        mc('it-g2-rep', 'Repetisjon — høflige uttrykk (leksjon 1)', 'Повторение грамматики урока 1: вежливые конструкции. Выберите единственно верную форму.',
           'Velg formen som er riktig i setningen.', [
               ('Taras spør buddyen sin', 'Jeg lurte på ___ du kunne vise meg kodebasen.', ['om', 'at', 'hvis'], 0,
                '«Jeg lurte på om …» — ja/nei-spørsmål i leddsetning.'),
               ('Høflig forespørsel', 'Kunne du ___ meg hvor jeg begynner?', ['vise', 'å vise', 'viser'], 0,
                'Etter modalverb kommer infinitiv uten «å».'),
               ('Ordstilling etter «om»', 'Jeg lurte på om han ___ fått tilgang.', ['ikke hadde', 'hadde ikke', 'ikke hadde å'], 0,
                'I leddsetning står «ikke» foran verbet.'),
               ('Et forsiktig ønske', 'Jeg håpet ___ en gjennomgang av Azure-oppsettet.', ['på', 'for', 'til'], 0,
                'Det heter «å håpe på noe».'),
           ], kind='grammar'),
        write('it-g2-essay', 'essay', 'Эссе по теме урока (120–180 слов): ваши первые недели на новом месте и норвежская офисная культура.',
              'Skriv en kort tekst (120–180 ord) i tre avsnitt.',
              'Tenk på en gang du var ny et sted — i en jobb, på et kurs eller i Norge. Hva har du lært og gjort siden da? Fortell om én konkret episode. Sammenlign arbeidskulturen der med den du kjenner fra hjemlandet ditt. Bruk minst seks ord fra leksjonen (for eksempel nyansatt, tilgang, gradvis, levere, dokumentasjon, prøvetid, begrunnelse, tillit) og både perfektum og preteritum.',
              [('Hva du har lært og gjort så langt', ['har lært', 'har jobbet', 'har fått', 'så langt']),
               ('Én konkret episode med tidspunkt', ['i går', 'første dag', 'første dagen', 'på mandag', 'en gang', 'da jeg']),
               ('Sammenligning med hjemlandet ditt', ['i hjemlandet', 'hos oss', 'annerledes', 'mens']),
               ('Hva du vil bli bedre på', ['vil', 'bedre', 'lære'])],
              ['Da jeg var ny …', 'Så langt har jeg …', 'Den første dagen …', 'I hjemlandet mitt …, mens i Norge …', 'Framover vil jeg gjerne …'],
              [('Oppgaveløsning', 'Alle fire punktene, med en konkret episode og en sammenligning.', 2, 'points',
                ['Svarer ikke på oppgaven.', 'Ett–to punkter, uten episode.', 'Tre punkter, eller fire uten sammenligning.',
                 'Alle fire punktene, konkret og med sammenligning.']),
               ('Struktur og sammenheng', 'Tre avsnitt, bindeord (først, etter hvert, derimot, mens).', 1, 'paragraphs', W_STRUCT),
               ('Språklig korrekthet', 'Perfektum i oppsummeringen, preteritum i episoden; rettskriving og ordstilling.', 1, 'language',
                ['Mange feil; verbtidene kan ikke skilles.', 'Bare én verbtid, eller gjennomgående feil i partisipp.',
                 'Begge verbtidene, med enkelte feil som ikke hindrer forståelsen.',
                 'Perfektum og preteritum riktig valgt og bøyd; få andre feil.']),
               ('Ordforråd og rettskriving', 'Minst seks ord fra leksjonen brukt riktig.', 1, 'lexis',
                ['Under tre ord fra leksjonen; mange skrivefeil.', 'Tre–fire ord fra leksjonen; flere skrivefeil.',
                 'Fem–seks ord fra leksjonen; enkelte skrivefeil.',
                 'Seks eller flere ord fra leksjonen, presist brukt; nesten ingen skrivefeil.'])],
              (120, 180), 10,
              'Da jeg begynte i min første jobb i Norge, var jeg nyansatt og ganske nervøs. Den første dagen fikk jeg en bærbar PC og tilgang til systemene, og en kollega viste meg kodebasen. Jeg forsto nesten ingenting av dokumentasjonen.\n\nSiden da har jeg lært mye. Jeg har gradvis tatt på meg egne oppgaver, og jeg har levert det jeg har lovet. Prøvetiden er snart over, og lederen min har gitt meg god tilbakemelding. En gang spurte jeg om begrunnelsen for en beslutning, og hun forklarte den åpent.\n\nI hjemlandet mitt er det mer hierarki. Der spør man sjelden sjefen direkte, mens i Norge handler mye om tillit: sjefen kontrollerer lite, og de ansatte sier ifra tidlig hvis de står fast. Det har vært uvant, men jeg liker det. Framover vil jeg gjerne bli bedre til å si min mening i møter.'),
    ]
    pending = {
        '2A': [listen('it-2a-listen', '2A', 'Lytt — første dag', [
            ('', 'Når møter Silje Taras i resepsjonen?', ['Klokka ni', 'Klokka åtte', 'Klokka ti'], 0, 'Silje møter ham klokka ni.'),
            ('', 'Hva setter Ingrid og Taras opp først?', ['Utviklingsmiljøet', 'Et møte med kunden', 'Azure-oppsettet'], 0,
             '«Først setter vi opp utviklingsmiljøet ditt.»'),
            ('', 'Hvor lenge er Ingrid buddyen hans?', ['Tre uker', 'Tre måneder', 'Én uke'], 0, '«… de neste tre ukene.»'),
        ])],
        '2B': [listen('it-2b-listen', '2B', 'Lytt — lunsj med teamet', [
            ('', 'Hvor lenge har Taras bodd i Norge?', ['Snart to år', 'Fem år', 'Tre uker'], 0, '«… har bodd i Norge i snart to år nå.»'),
            ('', 'Hva legger Taras merke til ved Norge?', ['At det er stille, og at folk er mye ute', 'At maten er dyr', 'At alle jobber sent'], 0,
             '«… hvor stille det er, og hvor mye folk er ute i naturen.»'),
            ('', 'Hvilken dag prøver alle å spise lunsj sammen?', ['Mandag', 'Fredag', 'Onsdag'], 0, '«… lunsjen på mandager prøver alle å være med på.»'),
        ])],
        '2C': [listen('it-2c-listen', '2C', 'Lytt — kontorkultur', [
            ('', 'Når kommer folk på jobb?', ['Mellom åtte og ti', 'Presis klokka åtte', 'Etter ti'], 0, 'Folk kommer mellom åtte og ti.'),
            ('', 'Hva spurte Taras Silje om?', ['Budsjettet for et prosjekt', 'Mer ferie', 'Ny PC'], 0, 'Han sendte en forespørsel om budsjettet.'),
            ('', 'Hvordan håndterer man uenighet?', ['Direkte og saklig', 'I gangen etter møtet', 'Skriftlig til sjefen'], 0,
             '«… uenighet håndterer man helst direkte og saklig.»'),
        ])],
        '2D': [
            listen('it-2d-listen', '2D', 'Lytt — oppfølgingsmøtet', [
                ('', 'Hvor lenge har Taras jobbet når han har møtet?', ['Tre uker', 'Seks uker', 'Seks måneder'], 0, 'Etter tre uker har han et oppfølgingsmøte.'),
                ('', 'Hvem har hjulpet Taras?', ['Ingrid og Mohammed', 'Erik', 'Kristian'], 0, '«… god hjelp fra Ingrid og Mohammed.»'),
                ('', 'Hvordan føler Taras seg etter møtet?', ['Lettet', 'Skuffet', 'Nervøs'], 0, 'Taras går ut av møtet lettet.'),
            ]),
            dictation('it-2d-dict', 'Diktat — leksjon 2', 'Диктант по словам урока 2: слушайте и записывайте по одному предложению.', [
                ('Taras har fått tilgang til kodebasen.', 'tilgang — med én l; kodebasen i ett ord.', ['tilgang', 'kodebasen']),
                ('Han tar gradvis på seg egne oppgaver.', 'gradvis — med d.', ['gradvis']),
                ('Prøvetiden varer i seks måneder.', 'prøvetiden — ø, i ett ord.', ['Prøvetiden']),
                ('Dokumentasjonen er ikke alltid oppdatert.', 'oppdatert — dobbel p.', ['Dokumentasjonen', 'oppdatert']),
                ('Jeg har levert det jeg har lovet.', 'Perfektum: har levert, har lovet.', ['levert', 'lovet']),
            ]),
        ],
    }
    return {'vocab': vocab, 'exercises': {'2A': a, '2B': b, '2C': c, '2D': d, '2': g}, 'pending': pending}


# ═════════════════════════════════════════════════════════════════════════════
# Leksjon 3 — Prosjektledelse og metodikk (G3: passiv)
# ═════════════════════════════════════════════════════════════════════════════
def unit3():
    vocab = {
        '3A': ('3A — Smidig eller foss?', [
            noun('fossefallsmetode', 'm', 'waterfall-метод', 'fossefallsmetoden', 'fossefallsmetoder', 'fossefallsmetodene'),
            noun('tilnærming', 'm', 'подход', 'tilnærmingen', 'tilnærminger', 'tilnærmingene'),
            noun('kravspesifikasjon', 'm', 'спецификация требований', 'kravspesifikasjonen', 'kravspesifikasjoner', 'kravspesifikasjonene'),
            noun('sprint', 'm', 'спринт', 'sprinten', 'sprinter', 'sprintene'),
            adj('overordnet', 'общий, вышестоящий', 'overordnet', 'overordnede'),
            other('justere kursen', 'скорректировать курс'),
            adj('uforutsigbar', 'непредсказуемый', 'uforutsigbart', 'uforutsigbare'),
            noun('tavle', 'f', 'доска (напр. Kanban)', 'tavla', 'tavler', 'tavlene'),
            noun('kolonne', 'm', 'колонка, столбец', 'kolonnen', 'kolonner', 'kolonnene'),
        ]),
        '3B': ('3B — Roller i prosjektet', [
            noun('Scrum Master', 'm', 'скрам-мастер', 'Scrum Masteren'),
            verb('forstyrre', 'мешать, отвлекать', 'forstyrrer', 'forstyrret', 'forstyrret'),
            noun('backlog', 'm', 'бэклог, список задач', 'backloggen', 'backlogger', 'backloggene'),
            noun('utviklingsteam', 'n', 'команда разработки', 'utviklingsteamet', 'utviklingsteam', 'utviklingsteamene'),
            verb('estimere', 'оценивать (по времени/сложности)', 'estimerer', 'estimerte', 'estimert'),
            noun('funksjonalitet', 'm', 'функциональность', 'funksjonaliteten'),
            adj('uklar', 'неясный', 'uklart', 'uklare'),
            noun('forkortelse', 'm', 'сокращение, аббревиатура', 'forkortelsen', 'forkortelser', 'forkortelsene'),
        ]),
        '3C': ('3C — Den daglige standupen', [
            other('oppreist', 'стоя', 'ADVERB'),
            verb('ferdigstille', 'завершать, доводить до готовности', 'ferdigstiller', 'ferdigstilte', 'ferdigstilt'),
            noun('blokkering', 'm', 'блокирующая проблема', 'blokkeringen', 'blokkeringer', 'blokkeringene'),
            noun('betalingsmodul', 'm', 'платёжный модуль', 'betalingsmodulen', 'betalingsmoduler', 'betalingsmodulene'),
            verb('logge (en feil)', 'зафиксировать (баг)', 'logger', 'logget', 'logget'),
            noun('autentisering', 'm', 'аутентификация', 'autentiseringen'),
            verb('sette av tid', 'выделить время', 'setter av tid', 'satte av tid', 'satt av tid'),
            noun('status', 'm', 'статус', 'statusen', 'statuser', 'statusene'),
            verb('kjøre på', 'приступать, «поехали»', 'kjører på', 'kjørte på', 'kjørt på'),
        ]),
        '3D': ('3D — Sprint-planlegging og retrospektiv', [
            noun('sprint-planlegging', 'm', 'планирование спринта', 'sprint-planleggingen'),
            noun('retrospektiv', 'n', 'ретроспектива', 'retrospektivet', 'retrospektiver', 'retrospektivene'),
            other('story points', 'стори-поинты'),
            verb('dukke opp', 'возникать, всплывать', 'dukker opp', 'dukket opp', 'dukket opp'),
            verb('se tilbake (på)', 'оглядываться (на)', 'ser tilbake', 'så tilbake', 'sett tilbake'),
            noun('poeng', 'n', 'замечание, довод', 'poenget', 'poeng', 'poengene'),
            verb('nikke', 'кивать', 'nikker', 'nikket', 'nikket'),
            verb('følge opp', 'отслеживать, доводить до конца', 'følger opp', 'fulgte opp', 'fulgt opp'),
        ]),
    }
    a = [
        sa('it-3a-sa', '3A', 'Husker du teksten? — 3A', RU_SA.format('3A'), [
            ('Hvilken metodikk bruker Nordly Tech?', [['scrum', 'smidig']], 'De jobber smidig og bruker Scrum.',
             '«Vi jobber smidig, altså agile — mer presist bruker vi Scrum.»', 'mer presist bruker vi Scrum'),
            ('Hva kjennetegner fossefallsmetoden?', [['planlagt', 'planlegges', 'planlegger', 'plan'], ['starten', 'steg', 'detalj']],
             'Alt blir planlagt i detalj fra starten, og man følger planen steg for steg.',
             'Taras forteller om sitt forrige firma.', 'planlagt i detalj'),
            ('Hvor lang er en sprint hos Nordly Tech?', [['to uker', '2 uker']], 'To uker.', '«… hos oss er en sprint to uker.»',
             'en sprint to uker'),
            ('Hva skjer etter hver sprint?', [['kunden', 'kunde'], ['vist', 'vises', 'viser', 'justerer', 'tilbakemeldingene', 'tilbakemelding']],
             'Resultatet blir vist til kunden, og teamet justerer kursen etter tilbakemeldingene.',
             '«Etter hver sprint blir resultatet vist til kunden …»', 'blir resultatet vist til kunden'),
            ('Hvorfor bruker support-teamet Kanban?', [['uforutsigbart', 'uforutsigbar', 'kan ikke planlegges', 'hele tiden']],
             'Fordi forespørslene fra brukerne kommer inn uforutsigbart og ikke kan planlegges i faste sprinter.',
             '«… forespørslene fra brukerne kommer inn uforutsigbart.»', 'kommer inn uforutsigbart'),
        ]),
        rg('it-3a-rg', '3A', 'Smidig eller foss?', [
            ('Med fossefallsmetoden planlegges alt i detalj fra starten.', True, 'Slik jobbet Taras i sitt forrige firma.', 'alt planlagt i detalj helt fra starten'),
            ('Hos Nordly Tech er en sprint fire uker.', False, 'En sprint er to uker.', 'en sprint to uker'),
            ('Support-teamet bruker Scrum.', False, 'De bruker Kanban.', 'support-teamet bruker Kanban i stedet for Scrum'),
            ('Det er billig å gjøre store endringer sent i et fossefallsprosjekt.', False, 'Det blir dyrt.', 'blir det dyrt å gjøre store endringer sent i prosessen'),
            ('Silje mener at det finnes én riktig metode for alt arbeid.', False, 'Hun sier det motsatte.', 'Det finnes ikke én riktig metode for alt'),
            ('Med Scrum oppdages feil tidligere.', True, 'Fordi kunden ser resultatet etter hver sprint.', 'Dermed oppdages feil og misforståelser'),
        ]),
        mc('it-3a-mc', 'Hva betyr ordet? — 3A', RU_MC.format('3A'), NB_MC, [
            ('korte perioder, kalt sprinter', 'en sprint', ['et helt prosjekt fra start til slutt', 'en kort, avgrenset arbeidsperiode', 'et møte'], 1,
             'En sprint er en fast, kort periode — hos Nordly Tech to uker.'),
            ('forespørslene kommer inn uforutsigbart', 'uforutsigbar', ['lett å planlegge', 'umulig å vite på forhånd', 'rask'], 1,
             'Uforutsigbar = man kan ikke forutsi det.'),
            ('vi justerer kursen basert på tilbakemeldingene', 'å justere kursen', ['å slutte helt', 'å endre retningen litt', 'å starte på nytt'], 1,
             'Å justere = å gjøre små endringer.'),
            ('en helt annen tilnærming', 'en tilnærming', ['en måte å gripe noe an på', 'en avstand mellom to ting', 'en forsinkelse'], 0,
             'Tilnærming = måten man går fram på.'),
            ('først kravspesifikasjon, så design', 'en kravspesifikasjon', ['en regning som sendes til kunden etterpå', 'en beskrivelse av hva systemet skal kunne', 'en testrapport'], 1,
             'Krav + spesifikasjon: hva som skal lages.'),
        ]),
        gap('it-3a-gap', RU_GAP, [
            ('I sitt forrige firma brukte Taras [fossefallsmetoden].', 'Нужно слово «waterfall-метод» в определённой форме.'),
            ('Hos Nordly Tech er en [sprint] to uker.', 'Нужно слово «спринт».'),
            ('Kanban bruker en [tavle] med kolonner.', 'Нужно слово «доска».'),
            ('Scrum er en helt annen [tilnærming] enn fossefallsmetoden.', 'Нужно слово «подход».'),
            ('Først skrev de en detaljert [kravspesifikasjon].', 'Нужно слово «спецификация требований».'),
            ('Forespørslene fra brukerne kommer inn [uforutsigbart].', 'Нужно наречие «непредсказуемо».'),
        ], distractors=['kolonne', 'møte']),
    ]
    b = [
        sa('it-3b-sa', '3B', 'Husker du teksten? — 3B', RU_SA.format('3B'), [
            ('Hvilke to roller har Silje?', [['teamleder'], ['scrum master']], 'Hun er både teamleder og Scrum Master.',
             '«Silje er både teamleder og Scrum Master hos oss.»', 'både teamleder og Scrum Master'),
            ('Hva er Scrum Masterens ansvar?', [['prosessen', 'scrum-prosessen', 'møtene', 'forstyrret', 'forstyrres']],
             'At Scrum-prosessen følges, at møtene holdes effektive, og at teamet ikke blir forstyrret unødvendig.',
             'Ingrid forklarer rollen.', 'Som Scrum'),
            ('Hva gjør produkteieren?', [['kundene', 'kunder', 'kunden'], ['prioriterer', 'backlog-en', 'backloggen', 'backlog']],
             'Kristian snakker med kundene, prioriterer hva som skal bygges, og eier backloggen.',
             '«Han snakker med kundene … og eier product backlog-en.»', 'Det er Kristian'),
            ('Hva bestemmer teamet selv?', [['hvordan']], 'Teamet bestemmer hvordan det skal lages.',
             '«… mens teamet bestemmer hvordan det skal lages.»', 'mens teamet'),
            ('Hva skal Taras gjøre hvis noe i kravene er uklart?', [['si ifra', 'sier ifra', 'spørre', 'spør']],
             'Han skal si ifra og spørre.', '«Bare si ifra hvis noe … er uklart.»', 'Bare si ifra'),
        ]),
        match('it-3b-match', 'Соедините начало и конец предложения по тексту 3B.', [
            ('Silje er teamleder og', 'Scrum Master.', 'Hun har to roller.'),
            ('Kristian eier', 'listen over alt som skal gjøres.', 'Det er backloggen.'),
            ('Produkteieren bestemmer hva som skal lages,', 'og teamet bestemmer hvordan.', 'Hva og rekkefølge: Kristian. Hvordan: teamet.'),
            ('Mohammed er', 'QA-ingeniør.', 'Han tester.'),
            ('Teamet estimerer', 'hvor lang tid oppgavene tar.', '«… estimerer hvor lang tid de tar.»'),
            ('Ved slutten av sprinten leverer teamet', 'ferdig, testet funksjonalitet.', 'Det er målet med hver sprint.'),
        ]),
        mc('it-3b-mc', 'Hva betyr ordet? — 3B', RU_MC.format('3B'), NB_MC, [
            ('tar vi oppgavene fra backloggen inn i sprinten', 'en backlog', ['en rapport om arbeid som er ferdig', 'en liste over arbeid som skal gjøres', 'et møterom'], 1,
             'Backlog = alt som venter på å bli gjort.'),
            ('estimerer hvor lang tid de tar', 'å estimere', ['å gjøre helt ferdig', 'å anslå på forhånd', 'å avlyse'], 1,
             'Å estimere = å anslå tid eller kompleksitet.'),
            ('at teamet ikke blir forstyrret unødvendig', 'å forstyrre', ['å hjelpe noen i gang', 'å avbryte noen i arbeidet', 'å planlegge'], 1,
             'Å forstyrre = å ta noen ut av konsentrasjonen.'),
            ('hvis noe … er uklart', 'uklar', ['vanskelig å forstå', 'veldig viktig', 'ferdig'], 0,
             'Uklar = ikke tydelig.'),
            ('ferdig, testet funksjonalitet', 'funksjonalitet', ['det systemet kan gjøre', 'en feil i systemet', 'et team'], 0,
             'Funksjonalitet = funksjonene brukeren får.'),
        ]),
        gap('it-3b-gap', RU_GAP, [
            ('Kristian er [produkteier] og snakker med kundene.', 'Слово из урока 1: «владелец продукта».'),
            ('Han eier [backloggen] — listen over alt som skal gjøres.', 'Нужно слово «бэклог» в определённой форме.'),
            ('Teamet [estimerer] hvor lang tid oppgavene tar.', 'Нужен глагол «оценивать (время)».'),
            ('Ved slutten av sprinten leverer teamet ferdig, testet [funksjonalitet].', 'Нужно слово «функциональность».'),
            ('Si ifra hvis noe i kravene er [uklart].', 'Нужно прилагательное «неясный» в среднем роде.'),
            ('Kristian skriver krav med en kort [begrunnelse].', 'Слово из урока 2: «обоснование».'),
        ], distractors=['forkortelse', 'tavle']),
        speak('it-3b-read', 'read', 'Les høyt — roller i teamet',
              'Прочитайте вслух два отрывка из текста 3B. Можно записать до трёх дублей.',
              'Les teksten høyt og tydelig. Du kan ta opp inntil tre ganger.', [
                  {'label': 'Ingrid om produkteieren', 'seconds': (12, 50, 20),
                   'text': 'Det er Kristian. Han snakker med kundene, håndterer forespørslene deres, prioriterer hva som skal bygges, og eier listen over alt som skal gjøres. Han bestemmer hva som skal lages og i hvilken rekkefølge, mens teamet bestemmer hvordan det skal lages.',
                   'focus': [('prioriterer', 'Trykk på nest siste staving: priori-TE-rer.'),
                             ('forespørslene', 'rs uttales som én lyd [ʂ] på østnorsk.'),
                             ('rekkefølge', 'Trykk på første staving; rund ø.')],
                   'note': 'Teksten er modellsvaret. Lytt etter kontrasten «hva» — «hvordan» og pause ved kommaene i oppramsingen.'},
                  {'label': 'Kristian om backloggen', 'seconds': (8, 40, 20),
                   'text': 'Bare si ifra hvis noe av det jeg skriver i backloggen er uklart — jeg prøver å skrive tydelige krav med en kort begrunnelse, men det hender jeg glemmer detaljer.',
                   'focus': [('begrunnelse', 'Trykk på andre staving: be-GRUNN-else.'),
                             ('tydelige', 'Stum g: «tydelie».'),
                             ('detaljer', 'Trykk på andre staving: de-TAL-jer.')],
                   'note': 'Teksten er modellsvaret. Lytt etter pause ved tankestreken og at «si ifra» leses sammen.'},
              ], [('pron', 2), ('flow', 1), ('acc', 1)], 7),
    ]
    c = [
        sa('it-3c-sa', '3C', 'Husker du teksten? — 3C', RU_SA.format('3C'), [
            ('Når er standupen, og hvor lenge varer den?', [['klokka ni', 'kl. 9', 'klokka 9'], ['femten minutter', '15 minutter', 'femten']],
             'Den er klokka ni hver morgen og varer maks femten minutter.', 'Det står i første avsnitt.', 'Klokka ni hver morgen'),
            ('Hva jobber Ingrid med?', [['innloggingssiden', 'innlogging']],
             'Hun ferdigstiller innloggingssiden og fortsetter med testing av den.', '«I går jobbet jeg med å ferdigstille innloggingssiden.»',
             'ferdigstille innloggingssiden'),
            ('Hva fant Mohammed?', [['to feil', '2 feil']], 'Han fant to feil i betalingsmodulen og har logget dem.',
             '«… fant to feil, som jeg har logget.»', 'fant to feil'),
            ('Hva er Taras usikker på?', [['autentisering', 'autentiseringen']],
             'Han er usikker på hvordan autentisering fungerer, og vil gjerne ha hjelp.',
             '«Jeg er litt usikker på hvordan autentisering fungerer her.»', 'hvordan autentisering fungerer'),
            ('Hva brukes standupen til?', [['status'], ['hjelp', 'trenger']],
             'Til å dele status og oppdage hvem som trenger hjelp — ikke til å løse problemer i detalj.',
             'Detaljerte diskusjoner tas etterpå.', 'bare til å dele status'),
        ]),
        rg('it-3c-rg', '3C', 'Den daglige standupen', [
            ('Standupen varer maks femten minutter.', True, 'Det står i første avsnitt.', 'Møtet varer maks femten minutter'),
            ('Mohammed fant ingen feil i betalingsmodulen.', False, 'Han fant to feil.', 'fant to feil'),
            ('Utviklingsmiljøet til Taras er endelig ferdig satt opp.', True, 'Det sier han selv.', 'utviklingsmiljøet mitt er endelig ferdig satt opp'),
            ('Problemer løses i detalj i standupen.', False, 'Standupen er bare for status.', 'løse problemer i detalj'),
            ('Silje ber Ingrid sette av tid til Taras.', True, 'Og sjekke tilgangen til testdatabasen.', 'kan du sette av tid til Taras etter standupen'),
            ('Denne standupen varer tjue minutter.', False, 'Den er ferdig på tolv minutter.', 'ferdig på tolv minutter'),
        ]),
        mc('it-3c-mc', 'Hva betyr ordet? — 3C', RU_MC.format('3C'), NB_MC, [
            ('jeg har ingen blokkeringer', 'en blokkering', ['noe som hjelper fremgangen', 'noe som hindrer deg i å komme videre', 'et møte'], 1,
             'En blokkering stopper arbeidet til noen fjerner den.'),
            ('å ferdigstille innloggingssiden', 'å ferdigstille', ['å begynne på noe', 'å gjøre noe helt ferdig', 'å slette noe'], 1,
             'Ferdig + stille: gjøre helt ferdig.'),
            ('fant to feil, som jeg har logget', 'å logge (en feil)', ['å overse en feil', 'å registrere en feil', 'å rette en feil'], 1,
             'Å logge = å skrive feilen inn i systemet. Å rette den er noe annet.'),
            ('kan du sette av tid til Taras', 'å sette av tid', ['å holde av tid til noe', 'å kaste bort tid', 'å komme for sent'], 0,
             'Å sette av tid = å reservere tid.'),
        ]),
        gap('it-3c-gap', RU_GAP, [
            ('Teamet samles til [standup] klokka ni.', 'Нужно слово «стендап».'),
            ('Mohammed har [logget] to feil.', 'Нужен глагол «зафиксировать» в форме причастия.'),
            ('Ingrid skal [ferdigstille] innloggingssiden.', 'Нужен глагол «завершить».'),
            ('Ingen i teamet har store [blokkeringer] i dag.', 'Нужно слово «блокирующие проблемы» (мн. число).'),
            ('Standupen brukes til å dele [status].', 'Нужно слово «статус».'),
            ('Taras har endelig fått [tilgang] til testdatabasen.', 'Слово из урока 2: «доступ».'),
        ], distractors=['frist', 'tavle']),
        speak('it-3c-standup', 'monologue', 'Standup — din status',
              'Стендап: расскажите свой статус (30–60 секунд на каждый). Вчера — preteritum, сегодня — presens; о своих задачах говорите в активе, не в пассиве.',
              'Det er standup. Fortell teamet om statusen din.', [
                  {'label': 'Vanlig status', 'seconds': (20, 60, 30),
                   'plan': [('Hva du gjorde i går', True), ('Hva du gjør i dag', True), ('Om du har blokkeringer', True)],
                   'note': 'Modell: «I går jobbet jeg med å ferdigstille innloggingssiden. I dag fortsetter jeg med testing av den. Jeg har ingen blokkeringer.» Lytt etter: preteritum om i går, presens om i dag, aktiv form («jeg tester», ikke «testes av meg»), ordet blokkering.'},
                  {'label': 'Status med en blokkering', 'seconds': (25, 60, 30),
                   'plan': [('Hva du gjorde i går', True), ('Hva som blokkerer deg i dag', True),
                            ('Hvem du trenger hjelp fra — spør høflig', True)],
                   'note': 'Modell: «I går satte jeg meg inn i databasestrukturen. I dag begynner jeg på oppgaven min, men jeg er usikker på hvordan autentisering fungerer. Ingrid, kunne du sette av litt tid til meg etter standupen?» Lytt etter: blokkeringen sagt kort (ingen lang forklaring), høflig forespørsel med «kunne du» / «jeg lurte på om».'},
              ], [('content_plan', 2),
                  (('lang', 'Språk', 'Preteritum om i går, presens om i dag, aktiv form om egne oppgaver.',
                    ['Verbtiden gjør statusen vanskelig å forstå.', 'Blander tidene, eller bruker tung passiv om egne oppgaver.',
                     'Riktig tid i de fleste setningene; noen feil i form.', 'Riktige tider, aktiv form, ord fra leksjonen.']), 1),
                  ('pron', 2), ('flow', 1)], 11),
    ]
    d = [
        sa('it-3d-sa', '3D', 'Husker du teksten? — 3D', RU_SA.format('3D'), [
            ('Hvor ofte har teamet sprint-planlegging?', [['annen mandag', 'andre mandag', 'annenhver']],
             'Hver andre mandag.', '«Hver andre mandag har teamet et lengre møte.»', 'Hver andre mandag'),
            ('Hva viser «story points»?', [['komplisert', 'kompleks', 'vanskelig']],
             'Hvor komplisert oppgaven er, ikke hvor lang tid den tar.', '«… et tall som viser hvor komplisert oppgaven er.»',
             'story points'),
            ('Hva er et retrospektiv?', [['tilbake', 'tilbakeblikk', 'evaluerer', 'oppsummerer']],
             'Et møte der teamet ser tilbake på hvordan sprinten gikk.', '«… der de ser tilbake på hvordan sprinten gikk.»',
             'retrospektiv-møte'),
            ('Hva kunne vært gjort bedre, ifølge Mohammed?', [['testing', 'testingen', 'feilene'], ['tidligere', 'sent']],
             'Feilene ble oppdaget litt sent, så testing bør startes tidligere.', '«Kanskje testing bør startes tidligere i sprinten neste gang?»',
             'oppdaget feilene'),
            ('Når kan Mohammeds anslag på tre dager bli for lite?', [['uventet', 'dukker opp', 'dukke opp']],
             'At det dukker opp noe uventet.', '«Sannsynligvis tre dager, hvis det ikke dukker opp noe uventet.»',
             'Sannsynligvis tre dager'),
            ('Hvor mange endringer blir teamet enige om?', [['én', 'en endring', 'bare en']],
             'Bare én konkret endring, for å klare å følge den opp.', '«… ikke ti, bare én.»', 'ikke ti, bare én'),
        ]),
        order('it-3d-order', 'Расставьте события в том порядке, в каком они идут в тексте 3D.',
              'Tekst 3D — Sprint-planlegging og retrospektiv.', [
                  'Kristian presenterer de viktigste sakene for sprinten.',
                  'Taras ber om å gå gjennom kravene før teamet estimerer.',
                  'Mohammed anslår at testingen tar tre dager.',
                  'Teamet blir enige om hvilke oppgaver som tas inn i sprinten.',
                  'I retrospektivet starter Silje med det som gikk bra.',
                  'Mohammed sier at feilene ble oppdaget litt sent.',
                  'Teamet blir enige om én konkret endring til neste sprint.',
              ], 'Først planleggingen: saker, krav, estimat, valg av oppgaver. Så retrospektivet i slutten av sprinten: '
                 'det som gikk bra, det som kunne vært bedre, og én endring.'),
        gap('it-3d-gap', RU_GAP, [
            ('«Godt [poeng],» sier Silje etter forslaget fra Mohammed.', 'Нужно слово «замечание, довод».'),
            ('Kravene til API-et er litt [uklare] for Taras.', 'Нужно прилагательное «неясный» во мн. числе.'),
            ('Kunden har en [frist] i slutten av måneden.', 'Нужно слово «срок, дедлайн».'),
            ('Hver oppgave [estimeres] i story points.', 'Нужен глагол «оценивать» в s-пассиве.'),
            ('Betalingsmodulen [prioriteres] først.', 'Нужен глагол «приоритизировать» в s-пассиве.'),
            ('I slutten av sprinten holder teamet et [retrospektiv].', 'Нужно слово «ретроспектива».'),
        ], distractors=['blokkering', 'tavle']),
        gap('it-3d-recall', RU_RECALL, [
            ('Scrum er en annen [tilnærming] enn fossefallsmetoden.', 'Слово из 3A: «подход».', '', [], 'подход'),
            ('Kristian eier [backloggen].', 'Слово из 3B в определённой форме.', '', ['backlogen', 'backlog'], 'бэклог'),
            ('Teamet [estimerer] oppgavene i story points.', 'Глагол из 3B.', '', [], 'оценивает'),
            ('Ingrid skal [ferdigstille] innloggingssiden i dag.', 'Глагол из 3C: «довести до готовности».', '', [], 'завершить'),
            ('Jeg har ingen [blokkeringer] i dag.', 'Слово из 3C, мн. число.', '', ['blokkering'], 'блокирующие проблемы'),
            ('Mohammed har [logget] to feil.', 'Глагол из 3C в форме причастия.', 'å logge — logget — har logget.', ['logga'], 'зафиксировал'),
            ('I går [dukket] det opp en uventet feil.', 'Глагол из 3D: «… opp» — возникнуть.', 'å dukke opp — dukket opp.', ['dukka'], 'возникла (… opp)'),
            ('Teamet må [følge] opp endringen i neste sprint.', 'Глагол из 3D: «… opp» — проследить.', '', [], 'проследить, довести до конца (… opp)'),
        ], free=True, title='Ord fra leksjon 3 — skriv selv'),
        gap('it-3d-rep', 'Повторение слов уроков 1–2: вставьте слово из банка.', [
            ('Kristian legger inn en [begrunnelse] i backloggen.', 'Слово из урока 2: «обоснование».'),
            ('Taras har [gradvis] tatt på seg egne oppgaver.', 'Слово из урока 2: «постепенно».'),
            ('I forrige sprint [optimaliserte] han en treg spørring.', 'Глагол из урока 1: «оптимизировал».'),
            ('Support-teamet [håndterer] mange forespørsler hver dag.', 'Глагол из урока 1: «обрабатывает».'),
            ('[Dokumentasjonen] må oppdateres før lansering.', 'Слово из урока 2: «документация».'),
            ('Taras er fortsatt i [prøvetiden].', 'Слово из урока 2: «испытательный срок».'),
        ], distractors=['kjennskap', 'ferdigheter'], title='Repetisjon — ord fra leksjon 1 og 2'),
        write('it-3d-write', 'free', 'Напишите короткую заметку по итогам ретроспективы (60–90 слов), минимум с двумя пассивными конструкциями.',
              'Skriv et kort retrospektiv-notat (60–90 ord).',
              'Sprinten er over, og du skal skrive et kort notat fra retrospektivet til teamets wiki. Skriv hva som gikk bra, hva som kunne vært gjort bedre, og hvilken ene endring teamet ble enige om. Bruk minst to passivformer (for eksempel «ble oppdaget», «bør startes»).',
              [('Hva som gikk bra', ['gikk bra', 'fungerte', 'samarbeidet']),
               ('Hva som kunne vært gjort bedre', ['kunne vært', 'for sent', 'bedre']),
               ('Én konkret endring til neste sprint', ['endring', 'neste sprint', 'enige om'])],
              ['Dette gikk bra: …', 'Dette kunne vært gjort bedre: …', '… ble oppdaget …', 'Til neste sprint: … skal/bør …-es'],
              [('Oppgaveløsning', 'Bra, bedre, og én endring.', 2, 'points',
                ['Ikke et retrospektiv-notat.', 'Ett punkt er med.', 'To punkter er med.', 'Alle tre punktene, konkret og kort.']),
               ('Struktur og sammenheng', 'Tre tydelige deler, i fast rekkefølge.', 1, 'paragraphs', W_STRUCT),
               ('Språklig korrekthet', 'Minst to passivformer (s-passiv eller bli-passiv), riktig dannet.', 1, 'language',
                ['Ingen passiv; mange feil.', 'Én passivform, eller passiv med feil form.', 'To passivformer, enkelte feil.',
                 'To eller flere passivformer, riktig dannet og riktig valgt.']),
               ('Ordforråd og rettskriving', 'Ord fra leksjonen (sprint, estimere, ferdigstille, følge opp, blokkering), riktig stavet.', 1, 'lexis', W_LEXIS)],
              (60, 90), 9,
              'Retrospektiv, sprint 14\n\nDette gikk bra: Samarbeidet om betalingsmodulen fungerte godt, og alle oppgavene ble ferdigstilt før fristen.\n\nDette kunne vært gjort bedre: To feil ble oppdaget sent, fordi testingen startet først i slutten av sprinten. Noen krav var også uklare da oppgavene ble estimert.\n\nTil neste sprint: Testing skal startes så snart en funksjon er klar. Silje følger opp endringen i neste retrospektiv.'),
    ]
    g = [
        mc('it-g3-mc', 'Velg riktig passivform', 'Выберите единственно верную форму пассива. Остальные варианты — ошибки.',
           'Velg formen som er riktig i setningen.', [
               ('Fast rutine', 'Oppgavene ___ i story points hver sprint.', ['estimeres', 'estimere', 'ble estimeres'], 0,
                'Fast rutine → s-passiv: verb + -s.', {2: '«Ble» står med partisipp (estimert), ikke med s-form.'}),
               ('Konkret hendelse', 'Sprinten ___ på mandag denne uka.', ['ble planlagt', 'ble planlegge', 'planlagt'], 0,
                'Konkret, avsluttet hendelse → bli-passiv: ble + partisipp.', {2: 'Partisipp alene er ikke en setning — hjelpeverbet «ble» mangler.'}),
               ('Instruks med modalverb', 'Feilen må ___ før lansering.', ['rettes', 'ble rettet', 'rettet'], 0,
                'Modalverb + s-passiv: må rettes.'),
               ('Konkret hendelse med agent', 'Feilene ___ av Mohammed i går.', ['ble logget', 'logges', 'logget'], 0,
                '«I går» → bli-passiv i preteritum: ble logget.', {1: 'S-passiv i presens passer ikke med «i går».'}),
               ('Hvem gjør det?', 'Backloggen eies ___ produkteieren.', ['av', 'fra', 'med'], 0,
                'Agenten i passiv innledes med «av».'),
               ('Regel med «skal»', 'Kode skal ___ gjennom av minst én kollega.', ['leses', 'lest', 'blir lest'], 0,
                'Etter modalverb: s-passiv i infinitiv (skal leses).', {2: 'Etter «skal» kan det ikke stå et finitt verb («blir»).'}),
           ], kind='grammar'),
        gap('it-g3-form', 'Впишите глагол в пассиве: s-пассив для правила или рутины, «ble + причастие» для конкретного события. Инфинитив дан в подсказке.', [
            ('Oppgavene [estimeres] i story points hver sprint.', 'Рутина («hver sprint») → s-пассив.', 'å estimere → estimeres.', ['blir estimert'], 'å estimere'),
            ('Feil bør [logges] med en gang de oppdages.', 'После модального глагола — s-пассив.', 'bør + logges.', [], 'å logge'),
            ('Betalingsmodulen må [testes] før lansering.', 'После модального глагола — s-пассив.', 'må + testes.', [], 'å teste'),
            ('Resultatet [vises] til kunden etter hver sprint.', 'Рутина («etter hver sprint») → s-пассив.', 'å vise → vises.', [], 'å vise'),
            ('Feilen ble [rettet] i går ettermiddag.', 'Конкретное событие: ble + причастие.', 'å rette — rettet — har rettet.', ['retta'], 'å rette'),
            ('Sprinten ble [planlagt] på mandag denne uka.', 'Конкретное событие: ble + причастие.', 'å planlegge — planla — har planlagt.', [], 'å planlegge'),
        ], free=True, title='Sett verbet i passiv',
            hint='Rutine/regel → s-passiv (estimeres, må testes). Konkret hendelse → ble + partisipp (ble rettet).'),
        errors('it-g3-err', 'В каждом предложении одна ошибка в пассиве. Найдите и исправьте её.',
               '«Ble» требует причастия; после модального глагола — форма на -s; деятель вводится предлогом «av».',
               'Passiv — finn feilen.', [
                   ('Sprinten ble planlegge på mandag.', 'Sprinten ble planlagt på mandag.', 'Bli-passiv: ble + partisipp (planlagt).'),
                   ('Feilen må rettet før lansering.', 'Feilen må rettes før lansering.', 'Etter modalverb står s-passiv: må rettes.'),
                   ('Backloggen eies fra produkteieren.', 'Backloggen eies av produkteieren.', 'Agenten innledes med «av».'),
                   ('To feil ble logges av Mohammed i går.', 'To feil ble logget av Mohammed i går.', '«Ble» + partisipp, ikke s-form.'),
                   ('Resultatet vise til kunden etter hver sprint.', 'Resultatet vises til kunden etter hver sprint.', 'S-passiv: verb + -s.'),
               ]),
        mc('it-g3-rep', 'Repetisjon — leksjon 1 og 2', 'Повторение грамматики уроков 1–2: вежливые конструкции, perfektum и preteritum. Выберите единственно верную форму.',
           'Velg formen som er riktig i setningen.', [
               ('«I 2022» — bestemt tidspunkt', 'Jeg ___ med fossefallsmetoden i mitt forrige firma i 2022.', ['jobbet', 'har jobbet', 'har jobbe'], 0,
                'Et årstall er et bestemt tidspunkt → preteritum.', {1: 'Perfektum kan ikke stå sammen med «i 2022».'}),
               ('«Så langt» først i setningen', 'Så langt ___ to sprinter.', ['har vi fullført', 'vi har fullført', 'fullførte vi har'], 0,
                '«Så langt» → perfektum, og verbet står på plass nummer to: Så langt har vi …'),
               ('Forsiktig forespørsel', 'Jeg lurte på ___ vi kunne gå gjennom kravene.', ['om', 'at', 'hvis'], 0,
                '«Jeg lurte på om …» — ja/nei-spørsmål i leddsetning.'),
               ('Høflig forespørsel', 'Kunne du ___ av tid til meg etter standupen?', ['sette', 'å sette', 'setter'], 0,
                'Etter modalverb kommer infinitiv uten «å».'),
           ], kind='grammar'),
        write('it-g3-essay', 'essay', 'Эссе по теме урока (120–180 слов): как организована работа в вашей команде и что вы изменили бы.',
              'Skriv en kort tekst (120–180 ord) i tre avsnitt.',
              'Hvordan organiseres arbeidet der du jobber, har jobbet eller studerer? Beskriv prosessen, sammenlign den med Scrum hos Nordly Tech, og skriv hva som fungerer bra og hva som kunne vært gjort bedre. Bruk minst seks ord fra leksjonen (for eksempel sprint, backlog, estimere, tilnærming, ferdigstille, blokkering, status, følge opp, funksjonalitet, uklar) og minst tre passivformer.',
              [('Hvordan arbeidet organiseres hos deg', ['planlegges', 'fordeles', 'organiseres', 'hos oss']),
               ('Sammenligning med Scrum hos Nordly Tech', ['Scrum', 'sprint', 'sammenlignet', 'mens']),
               ('Hva som fungerer bra', ['fungerer', 'bra', 'godt']),
               ('Hva som kunne vært gjort bedre, med ett forslag', ['kunne vært', 'bør', 'forslag', 'bedre'])],
              ['Hos oss planlegges arbeidet …', 'Oppgavene fordeles …', 'Sammenlignet med Scrum …', 'Det som fungerer bra, er …', '… kunne vært gjort bedre.', 'Mitt forslag er at … bør …-es'],
              [('Oppgaveløsning', 'Alle fire punktene, med sammenligning og ett forslag.', 2, 'points',
                ['Svarer ikke på oppgaven.', 'Ett–to punkter.', 'Tre punkter, eller fire uten sammenligning.',
                 'Alle fire punktene, konkret og med sammenligning.']),
               ('Struktur og sammenheng', 'Tre avsnitt (prosess, sammenligning, vurdering), bindeord.', 1, 'paragraphs', W_STRUCT),
               ('Språklig korrekthet', 'Passiv i prosessbeskrivelsen: s-passiv om rutiner, bli-passiv om hendelser.', 1, 'language',
                ['Ingen passiv; mange feil.', 'Én passivform, eller passiv med gjennomgående feil.',
                 'To passivformer riktig dannet; enkelte andre feil.',
                 'Tre eller flere passivformer, riktig dannet og riktig valgt; få andre feil.']),
               ('Ordforråd og rettskriving', 'Minst seks ord fra leksjonen brukt riktig.', 1, 'lexis',
                ['Under tre ord fra leksjonen; mange skrivefeil.', 'Tre–fire ord fra leksjonen; flere skrivefeil.',
                 'Fem–seks ord fra leksjonen; enkelte skrivefeil.',
                 'Seks eller flere ord fra leksjonen, presist brukt; nesten ingen skrivefeil.'])],
              (120, 180), 10,
              'I mitt forrige firma ble alt planlagt i begynnelsen av prosjektet. Først ble det skrevet en lang kravspesifikasjon, og så ble oppgavene fordelt av sjefen. Vi hadde ingen backlog og ingen sprinter, og status ble rapportert én gang i måneden.\n\nSammenlignet med Scrum hos Nordly Tech er det en helt annen tilnærming. Der planlegges arbeidet sprint for sprint, og oppgavene estimeres av teamet selv. Blokkeringer tas opp hver morgen i standupen, mens hos oss ble problemer ofte oppdaget for sent.\n\nDet som fungerte bra hos oss, var at kravene sjelden var uklare, fordi alt var beskrevet på forhånd. Men endringer var dyre, og vi klarte sjelden å ferdigstille funksjonalitet til fristen. Testing kunne vært startet mye tidligere. Mitt forslag er at arbeidet bør deles opp i korte perioder, og at hver endring følges opp i et kort møte.'),
    ]
    pending = {
        '3A': [listen('it-3a-listen', '3A', 'Lytt — smidig eller foss?', [
            ('', 'Hvor har Taras jobbet med fossefallsmetoden?', ['I sitt forrige firma', 'På studiet', 'Hos Nordly Tech'], 0, '«… i mitt forrige firma.»'),
            ('', 'Hvilke kolonner har Kanban-tavla?', ['Ikke startet, Pågår og Ferdig', 'Mandag, onsdag og fredag', 'Krav, design og test'], 0,
             '«Ikke startet», «Pågår» og «Ferdig».'),
            ('', 'Hvorfor passer Scrum for Nordly Tech?', ['De trenger regelmessig tilbakemelding fra kunden', 'Det er billigst', 'Kunden krever det'], 0,
             '«… fordi vi trenger regelmessig tilbakemelding fra kunden.»'),
        ])],
        '3B': [listen('it-3b-listen', '3B', 'Lytt — roller i prosjektet', [
            ('', 'Hvem tar Taras med på en gjennomgang av rollene?', ['Ingrid', 'Silje', 'Mohammed'], 0, 'Ingrid tar Taras med.'),
            ('', 'Hva heter produkteieren?', ['Kristian', 'Erik', 'Mohammed'], 0, '«Det er Kristian.»'),
            ('', 'Hva handler Scrum om, forstår Taras?', ['Klare roller og samarbeid', 'Mange møter', 'Tavler og kolonner'], 0,
             '… om klare roller og et samarbeid der alle vet hva som forventes.'),
        ])],
        '3C': [listen('it-3c-listen', '3C', 'Lytt — standupen', [
            ('', 'Hvem starter standupen?', ['Ingrid', 'Taras', 'Mohammed'], 0, '«Ingrid, vil du starte?»'),
            ('', 'Hva skal Taras begynne på i dag?', ['Et nytt felt i API-et', 'Testing av betalingsmodulen', 'Innloggingssiden'], 0,
             '«… å legge til et nytt felt i API-et.»'),
            ('', 'Hvor lenge varer standupen denne dagen?', ['Tolv minutter', 'Femten minutter', 'Ni minutter'], 0, 'Standupen er ferdig på tolv minutter.'),
        ])],
        '3D': [
            listen('it-3d-listen', '3D', 'Lytt — planlegging og retrospektiv', [
                ('', 'Hvor lang tid tar testingen, tror Mohammed?', ['Tre dager', 'To uker', 'Én dag'], 0, '«Sannsynligvis tre dager.»'),
                ('', 'Hva prioriteres først i sprinten?', ['Betalingsmodulen', 'Innloggingssiden', 'Dokumentasjonen'], 0,
                 'Kunden har en frist, så betalingsmodulen prioriteres først.'),
                ('', 'Hva blir teamet enige om i retrospektivet?', ['Å starte testing tidligere', 'Å ha lengre sprinter', 'Å droppe standupen'], 0,
                 'Testing starter så snart en funksjon er klar.'),
            ]),
            dictation('it-3d-dict', 'Diktat — leksjon 3', 'Диктант по словам урока 3: слушайте и записывайте по одному предложению.', [
                ('Oppgavene estimeres i story points.', 's-passiv: estimeres.', ['estimeres']),
                ('Jeg har ingen blokkeringer i dag.', 'blokkeringer — dobbel k.', ['blokkeringer']),
                ('Sprinten ble planlagt på mandag.', 'bli-passiv: ble planlagt.', ['planlagt']),
                ('Ingrid skal ferdigstille innloggingssiden.', 'ferdigstille — i ett ord, dobbel l.', ['ferdigstille', 'innloggingssiden']),
                ('Kravene til funksjonaliteten er uklare.', 'funksjonaliteten — ks skrives ks.', ['funksjonaliteten', 'uklare']),
            ]),
        ],
    }
    return {'vocab': vocab, 'exercises': {'3A': a, '3B': b, '3C': c, '3D': d, '3': g}, 'pending': pending}


# Author-facing notes that have no field in the templates: which A-words and which spine topic a
# free-form task expects, and which tasks recycle earlier leksjoner. The seed ignores `authoring`;
# seed_to_md.py prints it and task_audit.py reads it.
AUTHORING = {
    'it-1b-write': {'words': ['ferdighet', 'vedlikeholde', 'håndtere', 'strukturere', 'smidig', 'arbeidsflyt']},
    'it-1d-write': {'words': ['tilbud', 'takke ja', 'kontrakt', 'glede seg til'], 'grammar': 'G1 — kunne/ville, gjerne'},
    'it-1d-call': {'grammar': 'G1 — «jeg lurte på om», «ville det være mulig», «jeg håpet på»'},
    'it-g1-essay': {'words': ['≥ 6 из: ferdighet', 'trives', 'hjemmekontor', 'smidig', 'kjennskap', 'lære opp',
                              'strukturere', 'code review', 'arbeidsflyt', 'vedlikeholde'],
                    'grammar': 'G1 — минимум две вежливые конструкции в пункте «råd»'},
    'it-2b-speak': {'grammar': 'G2 — perfektum об опыте, preteritum о завершённом времени'},
    'it-2d-talk': {'grammar': 'G2 — perfektum в итоге, preteritum в эпизоде'},
    'it-2d-write': {'words': ['tilgang', 'kodebase', 'gradvis', 'levere', 'dokumentasjon', 'nyansatt'],
                    'grammar': 'G2 — perfektum в подведении итога'},
    'it-2d-rep': {'repeat': 'лексика leksjon 1'},
    'it-g2-rep': {'repeat': 'грамматика leksjon 1 (G1 — вежливые конструкции)'},
    'it-g2-essay': {'words': ['≥ 6 из: nyansatt', 'tilgang', 'gradvis', 'levere', 'dokumentasjon', 'prøvetid',
                              'begrunnelse', 'tillit'],
                    'grammar': 'G2 — perfektum в итоге и preteritum в эпизоде'},
    'it-3c-standup': {'grammar': 'G3 (контраст) — о своих задачах в активе; G1 — вежливая просьба о помощи'},
    'it-3d-rep': {'repeat': 'лексика leksjon 1–2'},
    'it-3d-write': {'words': ['sprint', 'estimere', 'ferdigstille', 'følge opp', 'blokkering', 'uklar'],
                    'grammar': 'G3 — минимум две пассивные формы'},
    'it-g3-rep': {'repeat': 'грамматика leksjon 1–2 (G1 — вежливые конструкции, G2 — perfektum/preteritum)'},
    'it-g3-essay': {'words': ['≥ 6 из: sprint', 'backlog', 'estimere', 'tilnærming', 'ferdigstille', 'blokkering',
                              'status', 'følge opp', 'funksjonalitet', 'uklar'],
                    'grammar': 'G3 — минимум три пассивные формы (s-пассив о рутине, bli-пассив о событии)'},
}


def patch_authoring(ex, pend):
    seen = set()
    for docs in list(ex.values()) + list(pend.values()):
        for d in docs:
            if d['key'] in AUTHORING:
                d['authoring'] = AUTHORING[d['key']]
                seen.add(d['key'])
    missing = set(AUTHORING) - seen
    if missing:
        raise SystemExit(f'authoring notes for unknown exercises: {sorted(missing)}')


if __name__ == '__main__':
    for n in (2, 3):
        sync_lessons(n)
    build({2: unit2(), 3: unit3()}, patches=[patch_unit1, patch_authoring])
