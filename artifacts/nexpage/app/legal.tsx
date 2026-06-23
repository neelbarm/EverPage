import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

const EFFECTIVE_DATE = 'June 17, 2026';
const CONTACT_EMAIL = 'privacy@everpage.app';

const PRIVACY_SECTIONS = [
  {
    title: '1. Information We Collect',
    body: `When you create an account, we collect your email address, username, and display name. When you use the app, we record your reading activity (book titles, authors, pages read, session duration, and reading streak data). If you upload a profile picture, the image is stored securely. To send you reading reminders and nudges from friends, we collect your device's push notification token.`,
  },
  {
    title: '2. How We Use Your Information',
    body: `We use your information solely to provide and improve EverPage. This includes syncing your reading data across sessions, enabling social features (followers, activity feed, nudges), sending optional reading reminders you configure, and displaying aggregate reading statistics. We do not sell your personal information to third parties.`,
  },
  {
    title: '3. Social Features',
    body: `Your username, display name, profile picture, and reading activity (books you're reading, session summaries) are visible to users who follow you. Margin notes you write are visible to followers once they reach the same page. Room messages are visible to all room members. You control who follows you and can remove followers at any time.`,
  },
  {
    title: '4. Data Sharing',
    body: `We use Expo (expo.dev) to deliver push notifications — your push token is transmitted to Expo's servers for this purpose. Profile pictures are stored using Google Cloud Storage. We do not share your reading activity, personal details, or usage data with advertisers or data brokers.`,
  },
  {
    title: '5. Data Retention',
    body: `Your data is retained for as long as your account is active. When you delete your account (Settings → Account → Delete Account), all your personal data — including reading history, notes, streak records, and profile information — is permanently deleted within 24 hours.`,
  },
  {
    title: '6. Children',
    body: `EverPage is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us and we will delete it promptly.`,
  },
  {
    title: '7. Security',
    body: `Passwords are hashed using bcrypt and never stored in plain text. All data transmission between the app and our servers uses HTTPS. Session tokens are stored securely on your device.`,
  },
  {
    title: '8. Your Rights',
    body: `You may access, update, or delete your personal information at any time through the app. To export your data or submit a privacy request, contact us at ${CONTACT_EMAIL}.`,
  },
  {
    title: '9. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify you of significant changes via the app or email. Continued use of EverPage after changes constitutes acceptance of the updated policy.`,
  },
  {
    title: '10. Contact',
    body: `Questions about this Privacy Policy? Contact us at ${CONTACT_EMAIL}.`,
  },
];

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance',
    body: `By creating an account or using EverPage, you agree to these Terms of Service. If you do not agree, do not use the app.`,
  },
  {
    title: '2. Eligibility',
    body: `You must be at least 13 years old to use EverPage. By using the app, you represent that you meet this requirement.`,
  },
  {
    title: '3. Your Account',
    body: `You are responsible for maintaining the security of your account and password. You agree to notify us immediately of any unauthorized use of your account. You are responsible for all activity that occurs under your account.`,
  },
  {
    title: '4. Acceptable Use',
    body: `You agree not to use EverPage to harass, threaten, or harm other users; post spam, misleading content, or content you do not have the right to share; attempt to access other users' accounts or our systems without authorization; or violate any applicable laws or regulations.`,
  },
  {
    title: '5. Objectionable Content & Zero Tolerance',
    body: `EverPage has zero tolerance for objectionable content and abusive behavior. You may not post, share, or transmit content that is harassing, threatening, hateful, sexually explicit, violent, defamatory, or otherwise objectionable, and you may not abuse, stalk, or impersonate other users. We do not permit this content anywhere in the app, including profiles, usernames, margin notes, and room messages.`,
  },
  {
    title: '6. Reporting, Blocking & Moderation',
    body: `You can report objectionable content or users at any time — tap the report option on a message or note, or open a user's profile and choose "Report user." You can also block any user from their profile, which immediately hides their content from you and yours from them and removes any connection between you. We review every report and act on violations — including removing content and suspending or terminating accounts — within 24 hours. To reach our moderation team directly, contact ${CONTACT_EMAIL}.`,
  },
  {
    title: '7. User Content',
    body: `You own the content you create in EverPage (margin notes, quotes, messages). By posting content visible to others, you grant EverPage a limited license to display that content within the app. We reserve the right to remove content that violates these Terms.`,
  },
  {
    title: '8. Intellectual Property',
    body: `Book cover images are sourced from OpenLibrary (openlibrary.org) and are used under their open access terms. Book titles, author names, and metadata are factual information not subject to copyright. EverPage's interface, design, and code are our intellectual property.`,
  },
  {
    title: '9. Disclaimers',
    body: `EverPage is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or that data will never be lost. We are not responsible for the content of books referenced within the app.`,
  },
  {
    title: '10. Limitation of Liability',
    body: `To the fullest extent permitted by law, EverPage shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the app.`,
  },
  {
    title: '11. Termination',
    body: `We may suspend or terminate your account if you violate these Terms. You may delete your account at any time via Settings.`,
  },
  {
    title: '12. Governing Law',
    body: `These Terms are governed by applicable law. Disputes shall be resolved through binding arbitration or small claims court, not class action.`,
  },
  {
    title: '13. Changes',
    body: `We may update these Terms. We will notify you of material changes. Continued use after changes constitutes acceptance.`,
  },
  {
    title: '14. Contact',
    body: `Questions? Contact us at ${CONTACT_EMAIL}.`,
  },
];

export default function LegalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>('privacy');

  const sections = activeTab === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const subtitle = activeTab === 'privacy' ? `Effective ${EFFECTIVE_DATE}` : `Last updated ${EFFECTIVE_DATE}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {(['privacy', 'terms'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.tabText,
              { fontFamily: activeTab === tab ? 'Inter_600SemiBold' : 'Inter_400Regular' },
              { color: activeTab === tab ? colors.primary : colors.mutedForeground },
            ]}>
              {tab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {section.title}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}>
              {section.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, gap: 1 },
  headerTitle: { fontSize: 17 },
  headerSub: { fontSize: 12 },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 14 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 24 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15 },
  sectionBody: { fontSize: 14, lineHeight: 22 },
});
