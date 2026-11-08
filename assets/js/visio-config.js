// Serveur de visio utilisé par visio.html.
//   ""                               -> serveur public meet.jit.si (appels coupés au bout de 5 minutes
//                                       quand la visio est intégrée à notre page)
//   "nsi-st-sernin.duckdns.org" (ex) -> notre Jitsi sur Oracle (docs/JITSI.md) : pas de limite de durée,
//                                       entrée réservée aux personnes connectées et non bannies (jeton).
export const SERVEUR_VISIO = "";
