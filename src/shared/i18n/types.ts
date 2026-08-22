/**
 * Paris Tour i18n type definitions
 */

export type Locale = 'zh-CN' | 'en' | 'fr'

export interface LocaleOption {
  id: Locale
  label: string
  nativeName: string
}

export const SUPPORTED_LOCALES: LocaleOption[] = [
  { id: 'zh-CN', label: '简体中文', nativeName: '简体中文' },
  { id: 'en', label: 'English', nativeName: 'English' },
]

export interface I18nSchema {
  common: {
    confirm: string
    cancel: string
    save: string
    saving: string
    saved: string
    saveFailed: string
    retry: string
    delete: string
    remove: string
    close: string
    loading: string
    error: string
    refresh: string
    copy: string
    copied: string
    copiedLink: string
    day: string
    days: string
    hours: string
    minutes: string
    all: string
    back: string
    reset: string
    edit: string
    done: string
    search: string
    optional: string
    actions: string
    readOnlyBanner: string
  }
  nav: {
    logistics: string
    itinerary: string
    itineraryDaily: string
    places: string
    hotel: string
    flights: string
    profile: string
    myTrips: string
    dayN: string
    loadingTrips: string
    switchTrip: string
    createTrip: string
  }
  auth: {
    login: string
    loginTitle: string
    loginSubtitle: string
    email: string
    emailPlaceholder: string
    password: string
    passwordPlaceholder: string
    signingIn: string
    signIn: string
    signUp: string
    sendMagicLink: string
    magicLinkSent: string
    logout: string
    anonymous: string
    profileTitle: string
    nickname: string
    nicknamePlaceholder: string
    editNickname: string
    changeAvatar: string
    avatarCropperTitle: string
    cropZoom: string
    cropConfirm: string
    cropReset: string
    theme: string
    themeLight: string
    themeDark: string
    themeSystem: string
    language: string
    cloudSyncActive: string
    cloudSyncBusy: string
    roleOwner: string
    roleEditor: string
    roleViewer: string
    companion: string
  }
  profile: {
    tripManagement: string
    allTrips: string
    currentTripsLabel: string
    sharedTrip: string
    openPreferences: string
    clearAllTitle: string
    clearAllDesc: string
    clearAllBtn: string
    tripStatsDays: string
    tripStatsPlaces: string
    tripStatsHotel: string
    tripStatsFlights: string
    placesCount: string
    hotelArranged: string
    hotelPending: string
    flightsEntered: string
    flightsPending: string
    themeTitle: string
    languageTitle: string
    langZh: string
    langEn: string
  }
  itinerary: {
    tripOverview: string
    tripDates: string
    datesTitle: string
    datesDesc: string
    datesReadOnly: string
    clearDates: string
    confirmClearDates: string
    nightsCount: string
    placeholderDateRange: string
    datesPending: string
    daysCount: string
    datesConfigured: string
    infoReady: string
    generateItinerary: string
    generatingItinerary: string
    regenerate: string
    emptyTimelineTitle: string
    emptyTimelineDesc: string
    dayTimelineTitle: string
    dayOriginHotel: string
    dayOriginStart: string
    departure: string
    arrival: string
    transit: string
    walking: string
    driving: string
    cycling: string
    deleteStop: string
    confirmDeleteStop: string
    dragToReorder: string
    openInGoogleMaps: string
    directionsLabel: string
    viewRoute: string
    stopNotes: string
    customTime: string
  }
  hotel: {
    title: string
    currentHotel: string
    selected: string
    unselected: string
    customHotel: string
    alreadyBooked: string
    customHotelPrompt: string
    customHotelPlaceholder: string
    dragPrompt: string
    chooseThisHotel: string
    removeFromCandidate: string
    selectedHotelLabel: string
    rating: string
    advisorReview: string
    regenerateAdvisor: string
    retryMatching: string
    loadingHotels: string
    viewDetails: string
    bookingReviews: string
  }
  flight: {
    title: string
    outbound: string
    inbound: string
    flightNumber: string
    flightNumberPlaceholder: string
    airline: string
    departureTime: string
    arrivalTime: string
    terminal: string
    seat: string
    enterFlight: string
    flightEntered: string
    flightPending: string
    ready: string
    pending: string
    lookupFlight: string
    searchingFlight: string
    saveFlight: string
    travelSectionTitle: string
  }
  place: {
    title: string
    searchPlaceholder: string
    addPlace: string
    allCategories: string
    coffee: string
    art: string
    walk: string
    shopping: string
    food: string
    monument: string
    googleRating: string
    tripadvisorRating: string
    priceLevel: string
    cuisine: string
    phone: string
    website: string
    viewInGoogleMaps: string
    advisorNoteTitle: string
    whyRecommend: string
    fitReason: string
    intro: string
    regenerateNote: string
    photoGallery: string
    refreshPhotos: string
    preferencesTitle: string
    preferencesSubtitle: string
    savePreferences: string
    customPreferencesPlaceholder: string
    extractingTags: string
  }
  chat: {
    title: string
    subtitle: string
    thinkingAuto: string
    thinkingManual: string
    thinkingOff: string
    thinkingLabel: string
    modelPickerTitle: string
    deepseekDesc: string
    gptDesc: string
    claudeDesc: string
    geminiDesc: string
    sendPromptPlaceholder: string
    applyChanges: string
    applied: string
    suggestedPrompts: string
    thinkingStatus: string
  }
  cloud: {
    backupTitle: string
    backupSubtitle: string
    exportJson: string
    importJson: string
    shareTitle: string
    shareSubtitle: string
    inviteMember: string
    inviteEmailPlaceholder: string
    sendInvite: string
    transferOwnership: string
    removeMember: string
    syncStatus: string
    syncSuccess: string
    syncError: string
    tripSelector: string
    createNewTrip: string
    tripName: string
    deleteTrip: string
    confirmDeleteTrip: string
  }
}

export type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`
}[keyof ObjectType & (string | number)]

export type TranslationKey = NestedKeyOf<I18nSchema>
