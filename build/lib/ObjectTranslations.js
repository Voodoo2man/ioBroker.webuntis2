"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ObjectTranslations_exports = {};
__export(ObjectTranslations_exports, {
  SUPPORTED_LANGUAGES: () => SUPPORTED_LANGUAGES,
  hasObjectValueChanged: () => hasObjectValueChanged,
  isGeneratedLessonName: () => isGeneratedLessonName,
  needsNameMigration: () => needsNameMigration,
  shouldMigrateDynamicName: () => shouldMigrateDynamicName,
  translatedLessonFallback: () => translatedLessonFallback,
  translatedName: () => translatedName,
  translatedStateName: () => translatedStateName,
  translatedTimetableGroup: () => translatedTimetableGroup,
  translatedWeekday: () => translatedWeekday
});
module.exports = __toCommonJS(ObjectTranslations_exports);
const SUPPORTED_LANGUAGES = ["en", "de", "es", "fr", "it", "nl", "pl", "pt", "ru", "uk", "zh-cn"];
const OBJECT_NAMES = {
  timetable: {
    en: "Timetable",
    de: "Stundenplan",
    es: "Horario",
    fr: "Emploi du temps",
    it: "Orario",
    nl: "Rooster",
    pl: "Plan lekcji",
    pt: "Hor\xE1rio",
    ru: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435",
    uk: "\u0420\u043E\u0437\u043A\u043B\u0430\u0434",
    "zh-cn": "\u8BFE\u7A0B\u8868"
  },
  holidays: {
    en: "Holidays",
    de: "Ferien",
    es: "Vacaciones",
    fr: "Vacances",
    it: "Vacanze",
    nl: "Vakanties",
    pl: "Wakacje",
    pt: "F\xE9rias",
    ru: "\u041A\u0430\u043D\u0438\u043A\u0443\u043B\u044B",
    uk: "\u041A\u0430\u043D\u0456\u043A\u0443\u043B\u0438",
    "zh-cn": "\u5047\u671F"
  },
  currentHoliday: {
    en: "Current holiday",
    de: "Aktuelle Ferien",
    es: "Vacaci\xF3n actual",
    fr: "Vacances actuelles",
    it: "Vacanza attuale",
    nl: "Huidige vakantie",
    pl: "Bie\u017C\u0105ce wakacje",
    pt: "F\xE9rias atuais",
    ru: "\u0422\u0435\u043A\u0443\u0449\u0438\u0435 \u043A\u0430\u043D\u0438\u043A\u0443\u043B\u044B",
    uk: "\u041F\u043E\u0442\u043E\u0447\u043D\u0456 \u043A\u0430\u043D\u0456\u043A\u0443\u043B\u0438",
    "zh-cn": "\u5F53\u524D\u5047\u671F"
  },
  nextHoliday: {
    en: "Next holiday",
    de: "N\xE4chste Ferien",
    es: "Pr\xF3ximas vacaciones",
    fr: "Prochaines vacances",
    it: "Prossime vacanze",
    nl: "Volgende vakantie",
    pl: "Nast\u0119pne wakacje",
    pt: "Pr\xF3ximas f\xE9rias",
    ru: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0435 \u043A\u0430\u043D\u0438\u043A\u0443\u043B\u044B",
    uk: "\u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0456 \u043A\u0430\u043D\u0456\u043A\u0443\u043B\u0438",
    "zh-cn": "\u4E0B\u4E00\u4E2A\u5047\u671F"
  },
  lessons: {
    en: "Lessons",
    de: "Unterrichtsstunden",
    es: "Clases",
    fr: "Cours",
    it: "Lezioni",
    nl: "Lessen",
    pl: "Lekcje",
    pt: "Aulas",
    ru: "\u0423\u0440\u043E\u043A\u0438",
    uk: "\u0423\u0440\u043E\u043A\u0438",
    "zh-cn": "\u8BFE\u7A0B"
  },
  information: {
    en: "Information",
    de: "Informationen",
    es: "Informaci\xF3n",
    fr: "Informations",
    it: "Informazioni",
    nl: "Informatie",
    pl: "Informacje",
    pt: "Informa\xE7\xF5es",
    ru: "\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F",
    uk: "\u0406\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0456\u044F",
    "zh-cn": "\u4FE1\u606F"
  },
  deviceOrServiceConnected: {
    en: "Device or service connected",
    de: "Ger\xE4t oder Dienst verbunden",
    es: "Dispositivo o servicio conectado",
    fr: "Appareil ou service connect\xE9",
    it: "Dispositivo o servizio connesso",
    nl: "Apparaat of service verbonden",
    pl: "Urz\u0105dzenie lub us\u0142uga po\u0142\u0105czona",
    pt: "Dispositivo ou servi\xE7o conectado",
    ru: "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u0438\u043B\u0438 \u0441\u0435\u0440\u0432\u0438\u0441 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u044B",
    uk: "\u041F\u0440\u0438\u0441\u0442\u0440\u0456\u0439 \u0430\u0431\u043E \u0441\u0435\u0440\u0432\u0456\u0441 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    "zh-cn": "\u8BBE\u5907\u6216\u670D\u52A1\u5DF2\u8FDE\u63A5"
  },
  lastUpdateAttempt: {
    en: "Last timetable update attempt",
    de: "Letzter Versuch einer Stundenplanaktualisierung",
    es: "\xDAltimo intento de actualizar el horario",
    fr: "Derni\xE8re tentative de mise \xE0 jour de l'emploi du temps",
    it: "Ultimo tentativo di aggiornamento dell'orario",
    nl: "Laatste poging om het rooster bij te werken",
    pl: "Ostatnia pr\xF3ba aktualizacji planu lekcji",
    pt: "\xDAltima tentativa de atualiza\xE7\xE3o do hor\xE1rio",
    ru: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u043F\u043E\u043F\u044B\u0442\u043A\u0430 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435",
    uk: "\u041E\u0441\u0442\u0430\u043D\u043D\u044F \u0441\u043F\u0440\u043E\u0431\u0430 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u0440\u043E\u0437\u043A\u043B\u0430\u0434\u0443",
    "zh-cn": "\u4E0A\u6B21\u66F4\u65B0\u8BFE\u7A0B\u8868\u7684\u5C1D\u8BD5"
  },
  lastSuccessfulUpdate: {
    en: "Last successful timetable update",
    de: "Letzte erfolgreiche Stundenplanaktualisierung",
    es: "\xDAltima actualizaci\xF3n exitosa del horario",
    fr: "Derni\xE8re mise \xE0 jour r\xE9ussie de l'emploi du temps",
    it: "Ultimo aggiornamento riuscito dell'orario",
    nl: "Laatste geslaagde roosterupdate",
    pl: "Ostatnia udana aktualizacja planu lekcji",
    pt: "\xDAltima atualiza\xE7\xE3o bem-sucedida do hor\xE1rio",
    ru: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F",
    uk: "\u041E\u0441\u0442\u0430\u043D\u043D\u0454 \u0443\u0441\u043F\u0456\u0448\u043D\u0435 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u0440\u043E\u0437\u043A\u043B\u0430\u0434\u0443",
    "zh-cn": "\u4E0A\u6B21\u6210\u529F\u66F4\u65B0\u8BFE\u7A0B\u8868"
  },
  nextUpdate: {
    en: "Next timetable update",
    de: "N\xE4chste Stundenplanaktualisierung",
    es: "Pr\xF3xima actualizaci\xF3n del horario",
    fr: "Prochaine mise \xE0 jour de l'emploi du temps",
    it: "Prossimo aggiornamento dell'orario",
    nl: "Volgende roosterupdate",
    pl: "Nast\u0119pna aktualizacja planu lekcji",
    pt: "Pr\xF3xima atualiza\xE7\xE3o do hor\xE1rio",
    ru: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F",
    uk: "\u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0435 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u0440\u043E\u0437\u043A\u043B\u0430\u0434\u0443",
    "zh-cn": "\u4E0B\u6B21\u66F4\u65B0\u8BFE\u7A0B\u8868"
  },
  day: {
    en: "Day",
    de: "Tag",
    es: "D\xEDa",
    fr: "Jour",
    it: "Giorno",
    nl: "Dag",
    pl: "Dzie\u0144",
    pt: "Dia",
    ru: "\u0414\u0435\u043D\u044C",
    uk: "\u0414\u0435\u043D\u044C",
    "zh-cn": "\u65E5\u671F"
  },
  lessonFallback: {
    en: "Lesson",
    de: "Unterrichtsstunde",
    es: "Clase",
    fr: "Cours",
    it: "Lezione",
    nl: "Les",
    pl: "Lekcja",
    pt: "Aula",
    ru: "\u0423\u0440\u043E\u043A",
    uk: "\u0423\u0440\u043E\u043A",
    "zh-cn": "\u8BFE\u7A0B"
  }
};
const STATE_NAMES = {
  startTime: {
    en: "Lesson start",
    de: "Unterrichtsbeginn",
    es: "Inicio de la clase",
    fr: "D\xE9but du cours",
    it: "Inizio della lezione",
    nl: "Start van de les",
    pl: "Pocz\u0105tek lekcji",
    pt: "In\xEDcio da aula",
    ru: "\u041D\u0430\u0447\u0430\u043B\u043E \u0443\u0440\u043E\u043A\u0430",
    uk: "\u041F\u043E\u0447\u0430\u0442\u043E\u043A \u0443\u0440\u043E\u043A\u0443",
    "zh-cn": "\u8BFE\u7A0B\u5F00\u59CB"
  },
  endTime: {
    en: "Lesson end",
    de: "Unterrichtsende",
    es: "Fin de la clase",
    fr: "Fin du cours",
    it: "Fine della lezione",
    nl: "Einde van de les",
    pl: "Koniec lekcji",
    pt: "Fim da aula",
    ru: "\u041A\u043E\u043D\u0435\u0446 \u0443\u0440\u043E\u043A\u0430",
    uk: "\u041A\u0456\u043D\u0435\u0446\u044C \u0443\u0440\u043E\u043A\u0443",
    "zh-cn": "\u8BFE\u7A0B\u7ED3\u675F"
  },
  active: {
    en: "Active",
    de: "Aktiv",
    es: "Activo",
    fr: "Actif",
    it: "Attivo",
    nl: "Actief",
    pl: "Aktywne",
    pt: "Ativo",
    ru: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E",
    uk: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E",
    "zh-cn": "\u6D3B\u52A8"
  },
  name: {
    en: "Name",
    de: "Name",
    es: "Nombre",
    fr: "Nom",
    it: "Nome",
    nl: "Naam",
    pl: "Nazwa",
    pt: "Nome",
    ru: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
    uk: "\u041D\u0430\u0437\u0432\u0430",
    "zh-cn": "\u540D\u79F0"
  },
  longName: {
    en: "Long name",
    de: "Vollst\xE4ndiger Name",
    es: "Nombre largo",
    fr: "Nom complet",
    it: "Nome completo",
    nl: "Volledige naam",
    pl: "Pe\u0142na nazwa",
    pt: "Nome completo",
    ru: "\u041F\u043E\u043B\u043D\u043E\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
    uk: "\u041F\u043E\u0432\u043D\u0430 \u043D\u0430\u0437\u0432\u0430",
    "zh-cn": "\u5B8C\u6574\u540D\u79F0"
  },
  startDate: {
    en: "Start date",
    de: "Startdatum",
    es: "Fecha de inicio",
    fr: "Date de d\xE9but",
    it: "Data di inizio",
    nl: "Begindatum",
    pl: "Data rozpocz\u0119cia",
    pt: "Data de in\xEDcio",
    ru: "\u0414\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430",
    uk: "\u0414\u0430\u0442\u0430 \u043F\u043E\u0447\u0430\u0442\u043A\u0443",
    "zh-cn": "\u5F00\u59CB\u65E5\u671F"
  },
  endDate: {
    en: "End date",
    de: "Enddatum",
    es: "Fecha de finalizaci\xF3n",
    fr: "Date de fin",
    it: "Data di fine",
    nl: "Einddatum",
    pl: "Data zako\u0144czenia",
    pt: "Data de fim",
    ru: "\u0414\u0430\u0442\u0430 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F",
    uk: "\u0414\u0430\u0442\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043D\u044F",
    "zh-cn": "\u7ED3\u675F\u65E5\u671F"
  },
  daysUntil: {
    en: "Days until",
    de: "Tage bis dahin",
    es: "D\xEDas restantes",
    fr: "Jours restants",
    it: "Giorni rimanenti",
    nl: "Dagen tot",
    pl: "Dni do",
    pt: "Dias restantes",
    ru: "\u0414\u043D\u0435\u0439 \u0434\u043E \u043D\u0430\u0447\u0430\u043B\u0430",
    uk: "\u0414\u043D\u0456\u0432 \u0434\u043E \u043F\u043E\u0447\u0430\u0442\u043A\u0443",
    "zh-cn": "\u5269\u4F59\u5929\u6570"
  },
  date: {
    en: "Date",
    de: "Datum",
    es: "Fecha",
    fr: "Date",
    it: "Data",
    nl: "Datum",
    pl: "Data",
    pt: "Data",
    ru: "\u0414\u0430\u0442\u0430",
    uk: "\u0414\u0430\u0442\u0430",
    "zh-cn": "\u65E5\u671F"
  },
  dateTimestamp: {
    en: "Date (Unix timestamp ms)",
    de: "Datum (Unix-Zeitstempel ms)",
    es: "Fecha (marca de tiempo Unix ms)",
    fr: "Date (horodatage Unix ms)",
    it: "Data (timestamp Unix ms)",
    nl: "Datum (Unix-tijdstempel ms)",
    pl: "Data (znacznik czasu Unix ms)",
    pt: "Data (timestamp Unix ms)",
    ru: "\u0414\u0430\u0442\u0430 (\u043C\u0435\u0442\u043A\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 Unix \u043C\u0441)",
    uk: "\u0414\u0430\u0442\u0430 (\u043C\u0456\u0442\u043A\u0430 \u0447\u0430\u0441\u0443 Unix \u043C\u0441)",
    "zh-cn": "\u65E5\u671F\uFF08Unix \u65F6\u95F4\u6233\u6BEB\u79D2\uFF09"
  },
  startDateTimestamp: {
    en: "Start date (Unix timestamp ms)",
    de: "Startdatum (Unix-Zeitstempel ms)",
    es: "Fecha de inicio (marca de tiempo Unix ms)",
    fr: "Date de d\xE9but (horodatage Unix ms)",
    it: "Data di inizio (timestamp Unix ms)",
    nl: "Begindatum (Unix-tijdstempel ms)",
    pl: "Data rozpocz\u0119cia (znacznik czasu Unix ms)",
    pt: "Data de in\xEDcio (timestamp Unix ms)",
    ru: "\u0414\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430 (\u043C\u0435\u0442\u043A\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 Unix \u043C\u0441)",
    uk: "\u0414\u0430\u0442\u0430 \u043F\u043E\u0447\u0430\u0442\u043A\u0443 (\u043C\u0456\u0442\u043A\u0430 \u0447\u0430\u0441\u0443 Unix \u043C\u0441)",
    "zh-cn": "\u5F00\u59CB\u65E5\u671F\uFF08Unix \u65F6\u95F4\u6233\u6BEB\u79D2\uFF09"
  },
  endDateTimestamp: {
    en: "End date (Unix timestamp ms)",
    de: "Enddatum (Unix-Zeitstempel ms)",
    es: "Fecha de finalizaci\xF3n (marca de tiempo Unix ms)",
    fr: "Date de fin (horodatage Unix ms)",
    it: "Data di fine (timestamp Unix ms)",
    nl: "Einddatum (Unix-tijdstempel ms)",
    pl: "Data zako\u0144czenia (znacznik czasu Unix ms)",
    pt: "Data de fim (timestamp Unix ms)",
    ru: "\u0414\u0430\u0442\u0430 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F (\u043C\u0435\u0442\u043A\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 Unix \u043C\u0441)",
    uk: "\u0414\u0430\u0442\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043D\u044F (\u043C\u0456\u0442\u043A\u0430 \u0447\u0430\u0441\u0443 Unix \u043C\u0441)",
    "zh-cn": "\u7ED3\u675F\u65E5\u671F\uFF08Unix \u65F6\u95F4\u6233\u6BEB\u79D2\uFF09"
  },
  lessonCount: {
    en: "Lesson count",
    de: "Anzahl der Unterrichtsstunden",
    es: "N\xFAmero de clases",
    fr: "Nombre de cours",
    it: "Numero di lezioni",
    nl: "Aantal lessen",
    pl: "Liczba lekcji",
    pt: "N\xFAmero de aulas",
    ru: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0443\u0440\u043E\u043A\u043E\u0432",
    uk: "\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C \u0443\u0440\u043E\u043A\u0456\u0432",
    "zh-cn": "\u8BFE\u7A0B\u6570\u91CF"
  },
  lessonDurationMinutes: {
    en: "Lesson duration in minutes",
    de: "Unterrichtsdauer in Minuten",
    es: "Duraci\xF3n de la clase en minutos",
    fr: "Dur\xE9e du cours en minutes",
    it: "Durata della lezione in minuti",
    nl: "Lesduur in minuten",
    pl: "Czas trwania lekcji w minutach",
    pt: "Dura\xE7\xE3o da aula em minutos",
    ru: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0443\u0440\u043E\u043A\u0430 \u0432 \u043C\u0438\u043D\u0443\u0442\u0430\u0445",
    uk: "\u0422\u0440\u0438\u0432\u0430\u043B\u0456\u0441\u0442\u044C \u0443\u0440\u043E\u043A\u0443 \u0432 \u0445\u0432\u0438\u043B\u0438\u043D\u0430\u0445",
    "zh-cn": "\u8BFE\u7A0B\u65F6\u957F\uFF08\u5206\u949F\uFF09"
  },
  schoolStart: {
    en: "School start",
    de: "Schulbeginn",
    es: "Inicio de la escuela",
    fr: "D\xE9but de l'\xE9cole",
    it: "Inizio della scuola",
    nl: "School begint",
    pl: "Pocz\u0105tek szko\u0142y",
    pt: "In\xEDcio da escola",
    ru: "\u041D\u0430\u0447\u0430\u043B\u043E \u0448\u043A\u043E\u043B\u044B",
    uk: "\u041F\u043E\u0447\u0430\u0442\u043E\u043A \u0448\u043A\u043E\u043B\u0438",
    "zh-cn": "\u5B66\u6821\u5F00\u59CB\u65F6\u95F4"
  },
  schoolEnd: {
    en: "School end",
    de: "Schulende",
    es: "Fin de la escuela",
    fr: "Fin de l'\xE9cole",
    it: "Fine della scuola",
    nl: "School eindigt",
    pl: "Koniec szko\u0142y",
    pt: "Fim da escola",
    ru: "\u041A\u043E\u043D\u0435\u0446 \u0448\u043A\u043E\u043B\u044B",
    uk: "\u041A\u0456\u043D\u0435\u0446\u044C \u0448\u043A\u043E\u043B\u0438",
    "zh-cn": "\u5B66\u6821\u7ED3\u675F\u65F6\u95F4"
  },
  subjects: {
    en: "Subjects",
    de: "F\xE4cher",
    es: "Asignaturas",
    fr: "Mati\xE8res",
    it: "Materie",
    nl: "Vakken",
    pl: "Przedmioty",
    pt: "Disciplinas",
    ru: "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B",
    uk: "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u0438",
    "zh-cn": "\u79D1\u76EE"
  },
  subjectCount: {
    en: "Subject count",
    de: "Anzahl der F\xE4cher",
    es: "N\xFAmero de asignaturas",
    fr: "Nombre de mati\xE8res",
    it: "Numero di materie",
    nl: "Aantal vakken",
    pl: "Liczba przedmiot\xF3w",
    pt: "N\xFAmero de disciplinas",
    ru: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043E\u0432",
    uk: "\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u0456\u0432",
    "zh-cn": "\u79D1\u76EE\u6570\u91CF"
  },
  firstSubject: {
    en: "First subject",
    de: "Erstes Fach",
    es: "Primera asignatura",
    fr: "Premi\xE8re mati\xE8re",
    it: "Prima materia",
    nl: "Eerste vak",
    pl: "Pierwszy przedmiot",
    pt: "Primeira disciplina",
    ru: "\u041F\u0435\u0440\u0432\u044B\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    uk: "\u041F\u0435\u0440\u0448\u0438\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    "zh-cn": "\u7B2C\u4E00\u79D1\u76EE"
  },
  lastSubject: {
    en: "Last subject",
    de: "Letztes Fach",
    es: "\xDAltima asignatura",
    fr: "Derni\xE8re mati\xE8re",
    it: "Ultima materia",
    nl: "Laatste vak",
    pl: "Ostatni przedmiot",
    pt: "\xDAltima disciplina",
    ru: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    uk: "\u041E\u0441\u0442\u0430\u043D\u043D\u0456\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    "zh-cn": "\u6700\u540E\u79D1\u76EE"
  },
  hasSchool: {
    en: "Has school",
    de: "Schule vorhanden",
    es: "Tiene escuela",
    fr: "A une \xE9cole",
    it: "Ha una scuola",
    nl: "Heeft school",
    pl: "Ma szko\u0142\u0119",
    pt: "Tem escola",
    ru: "\u0415\u0441\u0442\u044C \u0448\u043A\u043E\u043B\u0430",
    uk: "\u0404 \u0448\u043A\u043E\u043B\u0430",
    "zh-cn": "\u6709\u5B66\u6821"
  },
  hasChanges: {
    en: "Has changes",
    de: "Hat \xC4nderungen",
    es: "Tiene cambios",
    fr: "A des changements",
    it: "Ha modifiche",
    nl: "Heeft wijzigingen",
    pl: "Ma zmiany",
    pt: "Tem altera\xE7\xF5es",
    ru: "\u0415\u0441\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
    uk: "\u0404 \u0437\u043C\u0456\u043D\u0438",
    "zh-cn": "\u6709\u53D8\u66F4"
  },
  changeCount: {
    en: "Change count",
    de: "Anzahl der \xC4nderungen",
    es: "N\xFAmero de cambios",
    fr: "Nombre de changements",
    it: "Numero di modifiche",
    nl: "Aantal wijzigingen",
    pl: "Liczba zmian",
    pt: "N\xFAmero de altera\xE7\xF5es",
    ru: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439",
    uk: "\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C \u0437\u043C\u0456\u043D",
    "zh-cn": "\u53D8\u66F4\u6570\u91CF"
  },
  cancellationCount: {
    en: "Cancellation count",
    de: "Anzahl der Ausf\xE4lle",
    es: "N\xFAmero de cancelaciones",
    fr: "Nombre d'annulations",
    it: "Numero di cancellazioni",
    nl: "Aantal annuleringen",
    pl: "Liczba odwo\u0142a\u0144",
    pt: "N\xFAmero de cancelamentos",
    ru: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u043E\u0442\u043C\u0435\u043D",
    uk: "\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C \u0441\u043A\u0430\u0441\u0443\u0432\u0430\u043D\u044C",
    "zh-cn": "\u53D6\u6D88\u6570\u91CF"
  },
  currentLesson: {
    en: "Current lesson",
    de: "Aktuelle Unterrichtsstunde",
    es: "Clase actual",
    fr: "Cours actuel",
    it: "Lezione attuale",
    nl: "Huidige les",
    pl: "Bie\u017C\u0105ca lekcja",
    pt: "Aula atual",
    ru: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0443\u0440\u043E\u043A",
    uk: "\u041F\u043E\u0442\u043E\u0447\u043D\u0438\u0439 \u0443\u0440\u043E\u043A",
    "zh-cn": "\u5F53\u524D\u8BFE\u7A0B"
  },
  currentSubject: {
    en: "Current subject",
    de: "Aktuelles Fach",
    es: "Asignatura actual",
    fr: "Mati\xE8re actuelle",
    it: "Materia attuale",
    nl: "Huidig vak",
    pl: "Bie\u017C\u0105cy przedmiot",
    pt: "Disciplina atual",
    ru: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    uk: "\u041F\u043E\u0442\u043E\u0447\u043D\u0438\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    "zh-cn": "\u5F53\u524D\u79D1\u76EE"
  },
  currentRoom: {
    en: "Current room",
    de: "Aktueller Raum",
    es: "Aula actual",
    fr: "Salle actuelle",
    it: "Aula attuale",
    nl: "Huidig lokaal",
    pl: "Bie\u017C\u0105ca sala",
    pt: "Sala atual",
    ru: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442",
    uk: "\u041F\u043E\u0442\u043E\u0447\u043D\u0430 \u0430\u0443\u0434\u0438\u0442\u043E\u0440\u0456\u044F",
    "zh-cn": "\u5F53\u524D\u6559\u5BA4"
  },
  currentTeacher: {
    en: "Current teacher",
    de: "Aktuelle Lehrkraft",
    es: "Profesor actual",
    fr: "Enseignant actuel",
    it: "Insegnante attuale",
    nl: "Huidige leraar",
    pl: "Bie\u017C\u0105cy nauczyciel",
    pt: "Professor atual",
    ru: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0443\u0447\u0438\u0442\u0435\u043B\u044C",
    uk: "\u041F\u043E\u0442\u043E\u0447\u043D\u0438\u0439 \u0432\u0438\u043A\u043B\u0430\u0434\u0430\u0447",
    "zh-cn": "\u5F53\u524D\u6559\u5E08"
  },
  nextLesson: {
    en: "Next lesson",
    de: "N\xE4chste Unterrichtsstunde",
    es: "Pr\xF3xima clase",
    fr: "Prochain cours",
    it: "Prossima lezione",
    nl: "Volgende les",
    pl: "Nast\u0119pna lekcja",
    pt: "Pr\xF3xima aula",
    ru: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0443\u0440\u043E\u043A",
    uk: "\u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u0443\u0440\u043E\u043A",
    "zh-cn": "\u4E0B\u4E00\u8282\u8BFE"
  },
  nextSubject: {
    en: "Next subject",
    de: "N\xE4chstes Fach",
    es: "Pr\xF3xima asignatura",
    fr: "Prochaine mati\xE8re",
    it: "Prossima materia",
    nl: "Volgend vak",
    pl: "Nast\u0119pny przedmiot",
    pt: "Pr\xF3xima disciplina",
    ru: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    uk: "\u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    "zh-cn": "\u4E0B\u4E00\u79D1\u76EE"
  },
  nextRoom: {
    en: "Next room",
    de: "N\xE4chster Raum",
    es: "Pr\xF3xima aula",
    fr: "Prochaine salle",
    it: "Prossima aula",
    nl: "Volgend lokaal",
    pl: "Nast\u0119pna sala",
    pt: "Pr\xF3xima sala",
    ru: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442",
    uk: "\u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0430 \u0430\u0443\u0434\u0438\u0442\u043E\u0440\u0456\u044F",
    "zh-cn": "\u4E0B\u4E00\u6559\u5BA4"
  },
  nextTeacher: {
    en: "Next teacher",
    de: "N\xE4chste Lehrkraft",
    es: "Pr\xF3ximo profesor",
    fr: "Prochain enseignant",
    it: "Prossimo insegnante",
    nl: "Volgende leraar",
    pl: "Nast\u0119pny nauczyciel",
    pt: "Pr\xF3ximo professor",
    ru: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0443\u0447\u0438\u0442\u0435\u043B\u044C",
    uk: "\u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u0432\u0438\u043A\u043B\u0430\u0434\u0430\u0447",
    "zh-cn": "\u4E0B\u4E00\u4F4D\u6559\u5E08"
  },
  nextLessonStart: {
    en: "Next lesson start",
    de: "Beginn der n\xE4chsten Unterrichtsstunde",
    es: "Inicio de la pr\xF3xima clase",
    fr: "D\xE9but du prochain cours",
    it: "Inizio della prossima lezione",
    nl: "Start volgende les",
    pl: "Pocz\u0105tek nast\u0119pnej lekcji",
    pt: "In\xEDcio da pr\xF3xima aula",
    ru: "\u041D\u0430\u0447\u0430\u043B\u043E \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0443\u0440\u043E\u043A\u0430",
    uk: "\u041F\u043E\u0447\u0430\u0442\u043E\u043A \u043D\u0430\u0441\u0442\u0443\u043F\u043D\u043E\u0433\u043E \u0443\u0440\u043E\u043A\u0443",
    "zh-cn": "\u4E0B\u4E00\u8282\u8BFE\u5F00\u59CB"
  },
  minutesUntilNextLesson: {
    en: "Minutes until next lesson",
    de: "Minuten bis zur n\xE4chsten Unterrichtsstunde",
    es: "Minutos hasta la pr\xF3xima clase",
    fr: "Minutes avant le prochain cours",
    it: "Minuti alla prossima lezione",
    nl: "Minuten tot de volgende les",
    pl: "Minuty do nast\u0119pnej lekcji",
    pt: "Minutos at\xE9 \xE0 pr\xF3xima aula",
    ru: "\u041C\u0438\u043D\u0443\u0442 \u0434\u043E \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0433\u043E \u0443\u0440\u043E\u043A\u0430",
    uk: "\u0425\u0432\u0438\u043B\u0438\u043D \u0434\u043E \u043D\u0430\u0441\u0442\u0443\u043F\u043D\u043E\u0433\u043E \u0443\u0440\u043E\u043A\u0443",
    "zh-cn": "\u8DDD\u79BB\u4E0B\u4E00\u8282\u8BFE\u7684\u5206\u949F\u6570"
  },
  schoolRunning: {
    en: "School running",
    de: "Schulbetrieb",
    es: "Escuela en curso",
    fr: "\xC9cole en cours",
    it: "Scuola in corso",
    nl: "School bezig",
    pl: "Zaj\u0119cia trwaj\u0105",
    pt: "Escola em funcionamento",
    ru: "\u0428\u043A\u043E\u043B\u0430 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442",
    uk: "\u0428\u043A\u043E\u043B\u0430 \u043F\u0440\u0430\u0446\u044E\u0454",
    "zh-cn": "\u5B66\u6821\u6B63\u5728\u4E0A\u8BFE"
  },
  minutesUntilSchoolEnd: {
    en: "Minutes until school end",
    de: "Minuten bis zum Schulende",
    es: "Minutos hasta el final de la escuela",
    fr: "Minutes avant la fin de l'\xE9cole",
    it: "Minuti alla fine della scuola",
    nl: "Minuten tot einde school",
    pl: "Minuty do ko\u0144ca szko\u0142y",
    pt: "Minutos at\xE9 ao fim da escola",
    ru: "\u041C\u0438\u043D\u0443\u0442 \u0434\u043E \u043A\u043E\u043D\u0446\u0430 \u0448\u043A\u043E\u043B\u044B",
    uk: "\u0425\u0432\u0438\u043B\u0438\u043D \u0434\u043E \u043A\u0456\u043D\u0446\u044F \u0448\u043A\u043E\u043B\u0438",
    "zh-cn": "\u8DDD\u79BB\u5B66\u6821\u7ED3\u675F\u7684\u5206\u949F\u6570"
  },
  subject: {
    en: "Subject",
    de: "Fach",
    es: "Asignatura",
    fr: "Mati\xE8re",
    it: "Materia",
    nl: "Vak",
    pl: "Przedmiot",
    pt: "Disciplina",
    ru: "\u041F\u0440\u0435\u0434\u043C\u0435\u0442",
    uk: "\u041F\u0440\u0435\u0434\u043C\u0435\u0442",
    "zh-cn": "\u79D1\u76EE"
  },
  subjectLong: {
    en: "Subject name",
    de: "Fachname",
    es: "Nombre de la asignatura",
    fr: "Nom de la mati\xE8re",
    it: "Nome della materia",
    nl: "Naam van het vak",
    pl: "Nazwa przedmiotu",
    pt: "Nome da disciplina",
    ru: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u0430",
    uk: "\u041D\u0430\u0437\u0432\u0430 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u0430",
    "zh-cn": "\u79D1\u76EE\u540D\u79F0"
  },
  teacher: {
    en: "Teacher",
    de: "Lehrkraft",
    es: "Profesor",
    fr: "Enseignant",
    it: "Insegnante",
    nl: "Leraar",
    pl: "Nauczyciel",
    pt: "Professor",
    ru: "\u0423\u0447\u0438\u0442\u0435\u043B\u044C",
    uk: "\u0412\u0438\u043A\u043B\u0430\u0434\u0430\u0447",
    "zh-cn": "\u6559\u5E08"
  },
  room: {
    en: "Room",
    de: "Raum",
    es: "Aula",
    fr: "Salle",
    it: "Aula",
    nl: "Lokaal",
    pl: "Sala",
    pt: "Sala",
    ru: "\u041A\u0430\u0431\u0438\u043D\u0435\u0442",
    uk: "\u0410\u0443\u0434\u0438\u0442\u043E\u0440\u0456\u044F",
    "zh-cn": "\u6559\u5BA4"
  },
  class: {
    en: "Class",
    de: "Klasse",
    es: "Clase",
    fr: "Classe",
    it: "Classe",
    nl: "Klas",
    pl: "Klasa",
    pt: "Turma",
    ru: "\u041A\u043B\u0430\u0441\u0441",
    uk: "\u041A\u043B\u0430\u0441",
    "zh-cn": "\u73ED\u7EA7"
  },
  lessonId: {
    en: "WebUntis lesson ID",
    de: "WebUntis-Unterrichts-ID",
    es: "ID de clase de WebUntis",
    fr: "ID du cours WebUntis",
    it: "ID lezione WebUntis",
    nl: "WebUntis-les-ID",
    pl: "Identyfikator lekcji WebUntis",
    pt: "ID da aula WebUntis",
    ru: "ID \u0443\u0440\u043E\u043A\u0430 WebUntis",
    uk: "ID \u0443\u0440\u043E\u043A\u0443 WebUntis",
    "zh-cn": "WebUntis \u8BFE\u7A0B ID"
  },
  periodId: {
    en: "WebUntis period ID",
    de: "WebUntis-Stunden-ID",
    es: "ID de per\xEDodo de WebUntis",
    fr: "ID de p\xE9riode WebUntis",
    it: "ID periodo WebUntis",
    nl: "WebUntis-periode-ID",
    pl: "Identyfikator okresu WebUntis",
    pt: "ID do per\xEDodo WebUntis",
    ru: "ID \u043F\u0435\u0440\u0438\u043E\u0434\u0430 WebUntis",
    uk: "ID \u043F\u0435\u0440\u0456\u043E\u0434\u0443 WebUntis",
    "zh-cn": "WebUntis \u65F6\u6BB5 ID"
  },
  status: {
    en: "Lesson status",
    de: "Unterrichtsstatus",
    es: "Estado de la clase",
    fr: "Statut du cours",
    it: "Stato della lezione",
    nl: "Lesstatus",
    pl: "Status lekcji",
    pt: "Estado da aula",
    ru: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0443\u0440\u043E\u043A\u0430",
    uk: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0443\u0440\u043E\u043A\u0443",
    "zh-cn": "\u8BFE\u7A0B\u72B6\u6001"
  },
  changed: {
    en: "Lesson changed",
    de: "Unterricht ge\xE4ndert",
    es: "Clase modificada",
    fr: "Cours modifi\xE9",
    it: "Lezione modificata",
    nl: "Les gewijzigd",
    pl: "Lekcja zmieniona",
    pt: "Aula alterada",
    ru: "\u0423\u0440\u043E\u043A \u0438\u0437\u043C\u0435\u043D\u0451\u043D",
    uk: "\u0423\u0440\u043E\u043A \u0437\u043C\u0456\u043D\u0435\u043D\u043E",
    "zh-cn": "\u8BFE\u7A0B\u5DF2\u66F4\u6539"
  },
  cancelled: {
    en: "Lesson cancelled",
    de: "Unterrichtsausfall",
    es: "Clase cancelada",
    fr: "Cours annul\xE9",
    it: "Lezione annullata",
    nl: "Les geannuleerd",
    pl: "Lekcja odwo\u0142ana",
    pt: "Aula cancelada",
    ru: "\u0423\u0440\u043E\u043A \u043E\u0442\u043C\u0435\u043D\u0451\u043D",
    uk: "\u0423\u0440\u043E\u043A \u0441\u043A\u0430\u0441\u043E\u0432\u0430\u043D\u043E",
    "zh-cn": "\u8BFE\u7A0B\u5DF2\u53D6\u6D88"
  },
  substitution: {
    en: "Substitution",
    de: "Vertretung",
    es: "Sustituci\xF3n",
    fr: "Remplacement",
    it: "Sostituzione",
    nl: "Vervanging",
    pl: "Zast\u0119pstwo",
    pt: "Substitui\xE7\xE3o",
    ru: "\u0417\u0430\u043C\u0435\u043D\u0430",
    uk: "\u0417\u0430\u043C\u0456\u043D\u0430",
    "zh-cn": "\u4EE3\u8BFE"
  },
  originalTeacher: {
    en: "Original teacher",
    de: "Urspr\xFCngliche Lehrkraft",
    es: "Profesor original",
    fr: "Enseignant d'origine",
    it: "Insegnante originale",
    nl: "Oorspronkelijke leraar",
    pl: "Pierwotny nauczyciel",
    pt: "Professor original",
    ru: "\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0443\u0447\u0438\u0442\u0435\u043B\u044C",
    uk: "\u041F\u043E\u0447\u0430\u0442\u043A\u043E\u0432\u0438\u0439 \u0432\u0438\u043A\u043B\u0430\u0434\u0430\u0447",
    "zh-cn": "\u539F\u6559\u5E08"
  },
  originalRoom: {
    en: "Original room",
    de: "Urspr\xFCnglicher Raum",
    es: "Aula original",
    fr: "Salle d'origine",
    it: "Aula originale",
    nl: "Oorspronkelijk lokaal",
    pl: "Pierwotna sala",
    pt: "Sala original",
    ru: "\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442",
    uk: "\u041F\u043E\u0447\u0430\u0442\u043A\u043E\u0432\u0430 \u0430\u0443\u0434\u0438\u0442\u043E\u0440\u0456\u044F",
    "zh-cn": "\u539F\u6559\u5BA4"
  },
  originalSubject: {
    en: "Original subject",
    de: "Urspr\xFCngliches Fach",
    es: "Asignatura original",
    fr: "Mati\xE8re d'origine",
    it: "Materia originale",
    nl: "Oorspronkelijk vak",
    pl: "Pierwotny przedmiot",
    pt: "Disciplina original",
    ru: "\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    uk: "\u041F\u043E\u0447\u0430\u0442\u043A\u043E\u0432\u0438\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442",
    "zh-cn": "\u539F\u79D1\u76EE"
  }
};
function translatedName(key) {
  const value = OBJECT_NAMES[key] || STATE_NAMES[key];
  return { ...value };
}
function translatedLessonFallback(slot) {
  const result = translatedName("lessonFallback");
  for (const language of SUPPORTED_LANGUAGES) {
    result[language] = `${result[language]} ${slot}`;
  }
  return result;
}
const TIMETABLE_GROUP_NAMES = {
  today: {
    en: "Timetable today",
    de: "Stundenplan heute",
    es: "Horario de hoy",
    fr: "Emploi du temps d'aujourd'hui",
    it: "Orario di oggi",
    nl: "Rooster vandaag",
    pl: "Plan lekcji na dzi\u015B",
    pt: "Hor\xE1rio de hoje",
    ru: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F",
    uk: "\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u043D\u0430 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456",
    "zh-cn": "\u4ECA\u5929\u7684\u8BFE\u7A0B\u8868"
  },
  tomorrow: {
    en: "Timetable tomorrow",
    de: "Stundenplan morgen",
    es: "Horario de ma\xF1ana",
    fr: "Emploi du temps de demain",
    it: "Orario di domani",
    nl: "Rooster morgen",
    pl: "Plan lekcji na jutro",
    pt: "Hor\xE1rio de amanh\xE3",
    ru: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430",
    uk: "\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430",
    "zh-cn": "\u660E\u5929\u7684\u8BFE\u7A0B\u8868"
  },
  week: {
    en: "Timetable week",
    de: "Stundenplan Woche",
    es: "Horario semanal",
    fr: "Emploi du temps de la semaine",
    it: "Orario settimanale",
    nl: "Weekrooster",
    pl: "Tygodniowy plan lekcji",
    pt: "Hor\xE1rio semanal",
    ru: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0430 \u043D\u0435\u0434\u0435\u043B\u044E",
    uk: "\u0422\u0438\u0436\u043D\u0435\u0432\u0438\u0439 \u0440\u043E\u0437\u043A\u043B\u0430\u0434",
    "zh-cn": "\u6BCF\u5468\u8BFE\u7A0B\u8868"
  }
};
const WEEKDAY_NAMES = {
  monday: {
    en: "Monday",
    de: "Montag",
    es: "Lunes",
    fr: "Lundi",
    it: "Luned\xEC",
    nl: "Maandag",
    pl: "Poniedzia\u0142ek",
    pt: "Segunda-feira",
    ru: "\u041F\u043E\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0438\u043A",
    uk: "\u041F\u043E\u043D\u0435\u0434\u0456\u043B\u043E\u043A",
    "zh-cn": "\u661F\u671F\u4E00"
  },
  tuesday: {
    en: "Tuesday",
    de: "Dienstag",
    es: "Martes",
    fr: "Mardi",
    it: "Marted\xEC",
    nl: "Dinsdag",
    pl: "Wtorek",
    pt: "Ter\xE7a-feira",
    ru: "\u0412\u0442\u043E\u0440\u043D\u0438\u043A",
    uk: "\u0412\u0456\u0432\u0442\u043E\u0440\u043E\u043A",
    "zh-cn": "\u661F\u671F\u4E8C"
  },
  wednesday: {
    en: "Wednesday",
    de: "Mittwoch",
    es: "Mi\xE9rcoles",
    fr: "Mercredi",
    it: "Mercoled\xEC",
    nl: "Woensdag",
    pl: "\u015Aroda",
    pt: "Quarta-feira",
    ru: "\u0421\u0440\u0435\u0434\u0430",
    uk: "\u0421\u0435\u0440\u0435\u0434\u0430",
    "zh-cn": "\u661F\u671F\u4E09"
  },
  thursday: {
    en: "Thursday",
    de: "Donnerstag",
    es: "Jueves",
    fr: "Jeudi",
    it: "Gioved\xEC",
    nl: "Donderdag",
    pl: "Czwartek",
    pt: "Quinta-feira",
    ru: "\u0427\u0435\u0442\u0432\u0435\u0440\u0433",
    uk: "\u0427\u0435\u0442\u0432\u0435\u0440",
    "zh-cn": "\u661F\u671F\u56DB"
  },
  friday: {
    en: "Friday",
    de: "Freitag",
    es: "Viernes",
    fr: "Vendredi",
    it: "Venerd\xEC",
    nl: "Vrijdag",
    pl: "Pi\u0105tek",
    pt: "Sexta-feira",
    ru: "\u041F\u044F\u0442\u043D\u0438\u0446\u0430",
    uk: "\u041F\u2019\u044F\u0442\u043D\u0438\u0446\u044F",
    "zh-cn": "\u661F\u671F\u4E94"
  },
  saturday: {
    en: "Saturday",
    de: "Samstag",
    es: "S\xE1bado",
    fr: "Samedi",
    it: "Sabato",
    nl: "Zaterdag",
    pl: "Sobota",
    pt: "S\xE1bado",
    ru: "\u0421\u0443\u0431\u0431\u043E\u0442\u0430",
    uk: "\u0421\u0443\u0431\u043E\u0442\u0430",
    "zh-cn": "\u661F\u671F\u516D"
  },
  sunday: {
    en: "Sunday",
    de: "Sonntag",
    es: "Domingo",
    fr: "Dimanche",
    it: "Domenica",
    nl: "Zondag",
    pl: "Niedziela",
    pt: "Domingo",
    ru: "\u0412\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u0435",
    uk: "\u041D\u0435\u0434\u0456\u043B\u044F",
    "zh-cn": "\u661F\u671F\u65E5"
  }
};
function translatedTimetableGroup(group) {
  return { ...TIMETABLE_GROUP_NAMES[group] || { en: `Timetable ${group}` } };
}
function translatedWeekday(day) {
  return { ...WEEKDAY_NAMES[day] || { en: day || "Day" } };
}
function needsNameMigration(current, legacy) {
  return typeof current === "string" && current === legacy || typeof current === "object" && current !== null && current.en === legacy;
}
function isGeneratedLessonName(name) {
  return typeof name === "string" && (/^(?:\d{1,2}:\d{2})(?:–\d{1,2}:\d{2})?(?: · .+)?$/.test(name) || /^Lesson \d{2}$/.test(name));
}
function shouldMigrateDynamicName(current, generatedName) {
  return typeof generatedName === "string" ? generatedName === current : isGeneratedLessonName(current);
}
function hasObjectValueChanged(current, desired) {
  return JSON.stringify(current) !== JSON.stringify(desired);
}
const LEGACY_STATE_NAMES = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([key, value]) => [value.en, key])
);
function translatedStateName(name) {
  const key = LEGACY_STATE_NAMES[name];
  return key ? translatedName(key) : { en: name };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SUPPORTED_LANGUAGES,
  hasObjectValueChanged,
  isGeneratedLessonName,
  needsNameMigration,
  shouldMigrateDynamicName,
  translatedLessonFallback,
  translatedName,
  translatedStateName,
  translatedTimetableGroup,
  translatedWeekday
});
//# sourceMappingURL=ObjectTranslations.js.map
