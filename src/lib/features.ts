import {useAccount} from '../components/auth-gate'
export function useFeature(feature:'ai'|'groups'|'messengers'|'tasks'){const account=useAccount();return !!account?.user.isAdmin||!!account?.user.features?.includes(feature)}
