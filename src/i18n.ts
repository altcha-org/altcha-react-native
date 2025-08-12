export interface Translation {
  cancel: string;
  enterCode: string;
  enterCodeAria: string;
  error: string;
  expired: string;
  getAudioChallenge: string;
  footer: string;
  label: string;
  reload: string;
  verify: string;
  verificationRequired: string;
  verified: string;
  verifying: string;
}

export const defaultTranslations = {
  en: {
    cancel: 'Cancel',
    enterCode: 'Enter code',
    enterCodeAria: 'Enter code you hear. Press Space to play audio.',
    error: 'Verification failed. Try again later.',
    expired: 'Verification expired. Try again.',
    getAudioChallenge: 'Get an audio challenge',
    footer: 'Protected by ALTCHA',
    label: "I'm not a robot",
    reload: 'Reload',
    verify: 'Verify',
    verificationRequired: 'Verification required!',
    verified: 'Verified',
    verifying: 'Verifying...',
  },
  de: {
    cancel: 'Abbrechen',
    enterCode: 'Code eingeben',
    enterCodeAria:
      'Geben Sie den Code ein, den Sie hören. Drücken Sie die Leertaste, um Audio abzuspielen.',
    error: 'Verifizierung fehlgeschlagen. Versuchen Sie es später erneut.',
    expired: 'Verifizierung abgelaufen. Bitte erneut versuchen.',
    getAudioChallenge: 'Audio-Challenge abrufen',
    footer: 'Geschützt durch ALTCHA',
    label: 'Ich bin kein Roboter',
    reload: 'Neu laden',
    verify: 'Überprüfen',
    verificationRequired: 'Verifizierung erforderlich!',
    verified: 'Verifiziert',
    verifying: 'Überprüfung läuft...',
  },
  es: {
    cancel: 'Cancelar',
    enterCode: 'Introducir código',
    enterCodeAria:
      'Introduzca el código que escucha. Pulse Espacio para reproducir el audio.',
    error: 'La verificación ha fallado. Inténtelo de nuevo más tarde.',
    expired: 'La verificación ha caducado. Inténtelo de nuevo.',
    getAudioChallenge: 'Obtener un desafío de audio',
    footer: 'Protegido por ALTCHA',
    label: 'No soy un robot',
    reload: 'Recargar',
    verify: 'Verificar',
    verificationRequired: '¡Verificación requerida!',
    verified: 'Verificado',
    verifying: 'Verificando...',
  },
  fr: {
    cancel: 'Annuler',
    enterCode: 'Saisir le code',
    enterCodeAria:
      'Entrez le code que vous entendez. Appuyez sur Espace pour lire l’audio.',
    error: 'Échec de la vérification. Réessayez plus tard.',
    expired: 'Vérification expirée. Réessayez.',
    getAudioChallenge: 'Obtenir un défi audio',
    footer: 'Protégé par ALTCHA',
    label: 'Je ne suis pas un robot',
    reload: 'Recharger',
    verify: 'Vérifier',
    verificationRequired: 'Vérification requise !',
    verified: 'Vérifié',
    verifying: 'Vérification en cours...',
  },
  it: {
    cancel: 'Annulla',
    enterCode: 'Inserisci codice',
    enterCodeAria:
      'Inserisci il codice che senti. Premi Spazio per riprodurre l’audio.',
    error: 'Verifica non riuscita. Riprova più tardi.',
    expired: 'Verifica scaduta. Riprova.',
    getAudioChallenge: 'Ottieni una sfida audio',
    footer: 'Protetto da ALTCHA',
    label: 'Non sono un robot',
    reload: 'Ricarica',
    verify: 'Verifica',
    verificationRequired: 'Verifica richiesta!',
    verified: 'Verificato',
    verifying: 'Verifica in corso...',
  },
  pt: {
    cancel: 'Cancelar',
    enterCode: 'Inserir código',
    enterCodeAria:
      'Introduza o código que ouvir. Prima Espaço para reproduzir o áudio.',
    error: 'Falha na verificação. Tente novamente mais tarde.',
    expired: 'A verificação expirou. Tente novamente.',
    getAudioChallenge: 'Obter um desafio de áudio',
    footer: 'Protegido por ALTCHA',
    label: 'Não sou um robô',
    reload: 'Recarregar',
    verify: 'Verificar',
    verificationRequired: 'Verificação obrigatória!',
    verified: 'Verificado',
    verifying: 'A verificar...',
  },
} satisfies Record<string, Translation>;
