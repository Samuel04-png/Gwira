export type PreferenceKey = 'tabs' | 'layout' | 'sidebar' | 'business-sidebar' | 'business-channels' | 'pending-channel-create' | 'pending-directory-person' | 'channel-drafts' | 'conversation-state' | 'initial-generation' | 'global-chat';
export interface ExpectedWorkspace {userId: string; organizationId: string}
export interface ScopedPreferencesApi {
  read(key: PreferenceKey, expected?: ExpectedWorkspace): Promise<string | null>;
  write(key: PreferenceKey, value: string, expected?: ExpectedWorkspace): Promise<void>;
}
