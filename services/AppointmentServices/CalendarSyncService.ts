import axios from 'axios';
import AppointmentCalendarSync from '../../models/Appointments/AppointmentCalendarSync';
import Appointment from '../../models/Appointments/Appointment';
import CompaniesSettings from '../../models/CompaniesSettings';
import logger, { logError, logInfo, logWarn, logDebug } from '../../utils/logger';

// Lazy load googleapis to avoid startup errors if not installed
let google: any = null;
const getGoogle = async () => {
  if (!google) {
    try {
      const googleapis = await import('googleapis');
      google = googleapis.google;
    } catch (error) {
      logWarn('googleapis not installed - Google Calendar sync disabled');
      return null;
    }
  }
  return google;
};

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  conferenceData?: any;
}

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

class CalendarSyncService {

  /**
   * Get Google OAuth credentials from CompaniesSettings for a given company
   */
  private async getGoogleCredentials(companyId: number): Promise<GoogleCredentials | null> {
    try {
      const settings = await CompaniesSettings.findOne({
        where: { companyId },
        attributes: ['googleClientId', 'googleClientSecret']
      });

      if (!settings?.googleClientId || !settings?.googleClientSecret) {
        logWarn('Google Calendar credentials not configured for company', { companyId });
        return null;
      }

      return {
        clientId: settings.googleClientId,
        clientSecret: settings.googleClientSecret
      };
    } catch (error) {
      logError('Error fetching Google credentials', { error, companyId });
      return null;
    }
  }

  /**
   * Generate Google OAuth authorization URL
   */
  async getGoogleAuthUrl(companyId: number, redirectUri: string, state?: string): Promise<string | null> {
    try {
      const credentials = await this.getGoogleCredentials(companyId);
      if (!credentials) return null;

      const googleApi = await getGoogle();
      if (!googleApi) return null;

      const oauth2Client = new googleApi.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        redirectUri
      );

      const authConfig: any = {
        access_type: 'offline',
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events'
        ]
      };

      if (state) {
        authConfig.state = state;
      }

      const authUrl = oauth2Client.generateAuthUrl(authConfig);

      return authUrl;
    } catch (error) {
      logError('Error generating Google auth URL', { error, companyId });
      throw error;
    }
  }

  /**
   * Exchange authorization code for tokens and save sync configuration
   */
  async handleGoogleCallback(data: {
    companyId: number;
    userId: number;
    code: string;
    redirectUri: string;
  }): Promise<AppointmentCalendarSync | null> {
    try {
      const credentials = await this.getGoogleCredentials(data.companyId);
      if (!credentials) return null;

      const googleApi = await getGoogle();
      if (!googleApi) return null;

      const oauth2Client = new googleApi.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        data.redirectUri
      );

      const { tokens } = await oauth2Client.getToken(data.code);

      if (!tokens.refresh_token) {
        throw new Error(
          'Google no devolvio un refresh token. Revoca el acceso de la app en myaccount.google.com/permissions e intenta de nuevo.'
        );
      }

      oauth2Client.setCredentials(tokens);

      // Get primary calendar info
      const calendar = googleApi.calendar({ version: 'v3', auth: oauth2Client });
      const calendarInfo = await calendar.calendars.get({ calendarId: 'primary' });

      const sync = await this.setupGoogleCalendarSync({
        companyId: data.companyId,
        userId: data.userId,
        calendarId: 'primary',
        calendarName: calendarInfo.data.summary || 'Google Calendar',
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date || Date.now() + 3600000),
        syncDirection: 'bidirectional'
      });

      logInfo('Google Calendar connected via OAuth', {
        userId: data.userId,
        companyId: data.companyId,
        calendarName: calendarInfo.data.summary
      });

      return sync;
    } catch (error) {
      logError('Error handling Google OAuth callback', { error, userId: data.userId });
      throw error;
    }
  }

  /**
   * Create or update Google Calendar sync configuration
   */
  async setupGoogleCalendarSync(data: {
    companyId: number;
    userId: number;
    calendarId: string;
    calendarName?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    syncDirection?: string;
  }): Promise<AppointmentCalendarSync> {
    try {
      const [sync, created] = await AppointmentCalendarSync.findOrCreate({
        where: {
          userId: data.userId,
          provider: 'google',
          calendarId: data.calendarId
        },
        defaults: {
          companyId: data.companyId,
          userId: data.userId,
          provider: 'google',
          calendarId: data.calendarId,
          calendarName: data.calendarName,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenExpiresAt: data.expiresAt,
          syncDirection: data.syncDirection || 'bidirectional',
          syncEnabled: true
        }
      });

      if (!created) {
        await sync.update({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenExpiresAt: data.expiresAt,
          syncEnabled: true
        });
      }

      logInfo('Google Calendar sync configured', {
        syncId: sync.id,
        userId: data.userId,
        calendarId: data.calendarId
      });

      return sync;
    } catch (error) {
      logError('Error setting up Google Calendar sync', { error, data });
      throw error;
    }
  }

  /**
   * Create or update Outlook Calendar sync configuration
   */
  async setupOutlookCalendarSync(data: {
    companyId: number;
    userId: number;
    calendarId: string;
    calendarName?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    syncDirection?: string;
  }): Promise<AppointmentCalendarSync> {
    try {
      const [sync, created] = await AppointmentCalendarSync.findOrCreate({
        where: {
          userId: data.userId,
          provider: 'outlook',
          calendarId: data.calendarId
        },
        defaults: {
          companyId: data.companyId,
          userId: data.userId,
          provider: 'outlook',
          calendarId: data.calendarId,
          calendarName: data.calendarName,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenExpiresAt: data.expiresAt,
          syncDirection: data.syncDirection || 'bidirectional',
          syncEnabled: true
        }
      });

      if (!created) {
        await sync.update({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenExpiresAt: data.expiresAt,
          syncEnabled: true
        });
      }

      logInfo('Outlook Calendar sync configured', {
        syncId: sync.id,
        userId: data.userId,
        calendarId: data.calendarId
      });

      return sync;
    } catch (error) {
      logError('Error setting up Outlook Calendar sync', { error, data });
      throw error;
    }
  }

  /**
   * Sync appointment to Google Calendar
   */
  async syncToGoogleCalendar(
    appointment: Appointment,
    userId: number,
    companyId: number
  ): Promise<string | null> {
    try {
      // Get sync configuration
      const sync = await AppointmentCalendarSync.findOne({
        where: {
          userId,
          provider: 'google',
          syncEnabled: true
        }
      });

      if (!sync) {
        logDebug('No Google Calendar sync configured', { userId });
        return null;
      }

      // Check token expiration
      if (sync.tokenExpiresAt < new Date()) {
        await this.refreshGoogleToken(sync, companyId);
        await sync.reload();
      }

      // Initialize Google Calendar API
      const googleApi = await getGoogle();
      if (!googleApi) {
        logWarn('Google Calendar API not available', { userId });
        return null;
      }

      const credentials = await this.getGoogleCredentials(companyId);
      const oauth2Client = new googleApi.auth.OAuth2(
        credentials?.clientId,
        credentials?.clientSecret
      );
      oauth2Client.setCredentials({
        access_token: sync.accessToken,
        refresh_token: sync.refreshToken
      });

      const calendar = googleApi.calendar({ version: 'v3', auth: oauth2Client });

      // Prepare event data
      const event: CalendarEvent = {
        summary: appointment.title,
        description: appointment.description,
        location: appointment.location,
        start: {
          dateTime: appointment.startTime.toISOString(),
          timeZone: appointment.timezone
        },
        end: {
          dateTime: appointment.endTime.toISOString(),
          timeZone: appointment.timezone
        }
      };

      if (appointment.attendeeEmail) {
        event.attendees = [{
          email: appointment.attendeeEmail,
          displayName: appointment.attendeeName
        }];
      }

      // Add meeting URL if available
      if (appointment.meetingUrl) {
        event.conferenceData = {
          entryPoints: [{
            entryPointType: 'video',
            uri: appointment.meetingUrl
          }]
        };
      }

      // Create or update event
      let response;
      if (appointment.googleCalendarEventId) {
        // Update existing event
        response = await calendar.events.update({
          calendarId: sync.calendarId,
          eventId: appointment.googleCalendarEventId,
          requestBody: event
        });
      } else {
        // Create new event
        response = await calendar.events.insert({
          calendarId: sync.calendarId,
          requestBody: event,
          conferenceDataVersion: 1
        });

        // Update appointment with event ID
        await appointment.update({
          googleCalendarEventId: response.data.id
        });
      }

      // Update last sync time
      await sync.update({ lastSyncAt: new Date() });

      logInfo('Appointment synced to Google Calendar', {
        appointmentId: appointment.id,
        eventId: response.data.id
      });

      return response.data.id;
    } catch (error) {
      logError('Error syncing to Google Calendar', { error, appointmentId: appointment.id });
      throw error;
    }
  }

  /**
   * Sync appointment to Outlook Calendar
   */
  async syncToOutlookCalendar(
    appointment: Appointment,
    userId: number
  ): Promise<string | null> {
    try {
      // Get sync configuration
      const sync = await AppointmentCalendarSync.findOne({
        where: {
          userId,
          provider: 'outlook',
          syncEnabled: true
        }
      });

      if (!sync) {
        logWarn('No Outlook Calendar sync configured', { userId });
        return null;
      }

      // Check token expiration
      if (sync.tokenExpiresAt < new Date()) {
        await this.refreshOutlookToken(sync);
      }

      // Prepare event data
      const event = {
        subject: appointment.title,
        body: {
          contentType: 'HTML',
          content: appointment.description || ''
        },
        start: {
          dateTime: appointment.startTime.toISOString(),
          timeZone: appointment.timezone
        },
        end: {
          dateTime: appointment.endTime.toISOString(),
          timeZone: appointment.timezone
        },
        location: {
          displayName: appointment.location
        },
        attendees: appointment.attendeeEmail ? [{
          emailAddress: {
            address: appointment.attendeeEmail,
            name: appointment.attendeeName
          },
          type: 'required'
        }] : []
      };

      // Create or update event
      let response;
      if (appointment.outlookCalendarEventId) {
        // Update existing event
        response = await axios.patch(
          `https://graph.microsoft.com/v1.0/me/calendars/${sync.calendarId}/events/${appointment.outlookCalendarEventId}`,
          event,
          {
            headers: {
              'Authorization': `Bearer ${sync.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } else {
        // Create new event
        response = await axios.post(
          `https://graph.microsoft.com/v1.0/me/calendars/${sync.calendarId}/events`,
          event,
          {
            headers: {
              'Authorization': `Bearer ${sync.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // Update appointment with event ID
        await appointment.update({
          outlookCalendarEventId: response.data.id
        });
      }

      // Update last sync time
      await sync.update({ lastSyncAt: new Date() });

      logInfo('Appointment synced to Outlook Calendar', {
        appointmentId: appointment.id,
        eventId: response.data.id
      });

      return response.data.id;
    } catch (error) {
      logError('Error syncing to Outlook Calendar', { error, appointmentId: appointment.id });
      throw error;
    }
  }

  /**
   * Refresh Google OAuth token using per-company credentials
   */
  private async refreshGoogleToken(sync: AppointmentCalendarSync, companyId: number): Promise<void> {
    try {
      const credentials = await this.getGoogleCredentials(companyId);
      if (!credentials) {
        throw new Error('Google Calendar credentials not configured for this company');
      }

      const googleApi = await getGoogle();
      if (!googleApi) {
        throw new Error('Google Calendar API not available');
      }

      const oauth2Client = new googleApi.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret
      );

      oauth2Client.setCredentials({
        refresh_token: sync.refreshToken
      });

      const { credentials: newCreds } = await oauth2Client.refreshAccessToken();

      await sync.update({
        accessToken: newCreds.access_token,
        tokenExpiresAt: new Date(newCreds.expiry_date || Date.now() + 3600000)
      });

      logInfo('Google token refreshed', { syncId: sync.id });
    } catch (error) {
      logError('Error refreshing Google token', { error, syncId: sync.id });
      throw error;
    }
  }

  /**
   * Refresh Outlook OAuth token
   */
  private async refreshOutlookToken(sync: AppointmentCalendarSync): Promise<void> {
    try {
      const response = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: process.env.OUTLOOK_CLIENT_ID!,
          client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
          refresh_token: sync.refreshToken,
          grant_type: 'refresh_token'
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      await sync.update({
        accessToken: response.data.access_token,
        tokenExpiresAt: new Date(Date.now() + response.data.expires_in * 1000)
      });

      logInfo('Outlook token refreshed', { syncId: sync.id });
    } catch (error) {
      logError('Error refreshing Outlook token', { error, syncId: sync.id });
      throw error;
    }
  }

  /**
   * Delete event from Google Calendar
   */
  async deleteFromGoogleCalendar(
    eventId: string,
    userId: number,
    companyId: number
  ): Promise<boolean> {
    try {
      const sync = await AppointmentCalendarSync.findOne({
        where: { userId, provider: 'google', syncEnabled: true }
      });

      if (!sync) return false;

      // Check token expiration
      if (sync.tokenExpiresAt < new Date()) {
        await this.refreshGoogleToken(sync, companyId);
        await sync.reload();
      }

      const googleApi = await getGoogle();
      if (!googleApi) {
        logWarn('Google Calendar API not available');
        return false;
      }

      const credentials = await this.getGoogleCredentials(companyId);
      const oauth2Client = new googleApi.auth.OAuth2(
        credentials?.clientId,
        credentials?.clientSecret
      );
      oauth2Client.setCredentials({
        access_token: sync.accessToken,
        refresh_token: sync.refreshToken
      });

      const calendar = googleApi.calendar({ version: 'v3', auth: oauth2Client });

      await calendar.events.delete({
        calendarId: sync.calendarId,
        eventId
      });

      logInfo('Event deleted from Google Calendar', { eventId });
      return true;
    } catch (error) {
      logError('Error deleting from Google Calendar', { error, eventId });
      return false;
    }
  }

  /**
   * Delete event from Outlook Calendar
   */
  async deleteFromOutlookCalendar(
    eventId: string,
    userId: number
  ): Promise<boolean> {
    try {
      const sync = await AppointmentCalendarSync.findOne({
        where: { userId, provider: 'outlook', syncEnabled: true }
      });

      if (!sync) return false;

      await axios.delete(
        `https://graph.microsoft.com/v1.0/me/calendars/${sync.calendarId}/events/${eventId}`,
        {
          headers: { 'Authorization': `Bearer ${sync.accessToken}` }
        }
      );

      logInfo('Event deleted from Outlook Calendar', { eventId });
      return true;
    } catch (error) {
      logError('Error deleting from Outlook Calendar', { error, eventId });
      return false;
    }
  }

  /**
   * Disable calendar sync
   */
  async disableSync(
    userId: number,
    provider: string
  ): Promise<boolean> {
    try {
      const sync = await AppointmentCalendarSync.findOne({
        where: { userId, provider }
      });

      if (!sync) return false;

      await sync.update({ syncEnabled: false });

      logInfo('Calendar sync disabled', { userId, provider });
      return true;
    } catch (error) {
      logError('Error disabling sync', { error, userId, provider });
      throw error;
    }
  }

  /**
   * Get user's active calendar syncs
   */
  async getUserSyncs(userId: number): Promise<AppointmentCalendarSync[]> {
    try {
      const syncs = await AppointmentCalendarSync.findAll({
        where: { userId, syncEnabled: true }
      });

      return syncs;
    } catch (error) {
      logError('Error getting user syncs', { error, userId });
      throw error;
    }
  }
}

export default new CalendarSyncService();
