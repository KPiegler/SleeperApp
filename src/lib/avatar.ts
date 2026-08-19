import type { SleeperLeague, SleeperUser } from '../api/types';

export function userAvatarUrl(user: SleeperUser | undefined | null): string | null {
  if (!user) return null;
  const metaAvatar = user.metadata?.avatar;
  if (metaAvatar) return metaAvatar;
  if (user.avatar) return `https://sleepercdn.com/avatars/thumbs/${user.avatar}`;
  return null;
}

export function leagueAvatarUrl(league: SleeperLeague | null | undefined): string | null {
  if (!league?.avatar) return null;
  return `https://sleepercdn.com/avatars/${league.avatar}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
