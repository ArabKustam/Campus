/** Platonus logins are "Имя_Фамилия" (e.g. Ivan_Petrov). Derives a readable name; null when the login does not look like a name. */
const word=/^\p{L}+(?:['’-]\p{L}+)*$/u
const cap=(part:string)=>part.toLowerCase().replace(/(^|[-'’])(\p{L})/gu,(_,sep:string,ch:string)=>sep+ch.toUpperCase())
export function nameFromLogin(login?:string|null):string|null{
 const local=(login??'').trim().split('@')[0].normalize('NFC')
 if(!local||local.length>120)return null
 const parts=local.split(/[_.\s]+/).map(part=>part.replace(/^[-'’]+|[-'’]+$/g,'').replace(/\d+$/,'')).filter(Boolean)
 if(parts.length<2||parts.length>5||!parts.every(part=>part.length>1&&word.test(part)))return null
 return parts.map(cap).join(' ')
}
export type NameSource='platonus'|'login'|'account'
/** Real Platonus full name wins, then the name encoded in the Platonus login, then a hand-set Campus name, then the Campus login. */
export function studentName(user:{platonusName?:string|null;platonusLogin?:string|null;displayName?:string|null;login:string}):{name:string;source:NameSource}{
 const real=user.platonusName?.trim();if(real)return {name:real,source:'platonus'}
 const fromPlatonus=nameFromLogin(user.platonusLogin);if(fromPlatonus)return {name:fromPlatonus,source:'login'}
 const display=user.displayName?.trim();if(display&&display.toLowerCase()!==user.login.toLowerCase())return {name:display,source:'account'}
 const fromLogin=nameFromLogin(user.login);if(fromLogin)return {name:fromLogin,source:'login'}
 return {name:display||user.login,source:'account'}
}
