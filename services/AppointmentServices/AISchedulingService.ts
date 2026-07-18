import { Op } from 'sequelize';
import AppointmentAISuggestion from '../../models/Appointments/AppointmentAISuggestion';
import Appointment from '../../models/Appointments/Appointment';
import Contact from '../../models/Contact';
import Ticket from '../../models/Ticket';
import AppointmentService from '../../models/AppointmentService';
import logger, { logError, logInfo, logWarn, logDebug } from '../../utils/logger';
import AvailabilityService from './AvailabilityService';

// 🆕 SERVICIO CENTRALIZADO DE IA
import { chatCompletion } from '../AIClientService';

interface AISchedulingContext {
  companyId: number;
  contactId: number;
  serviceId: number;
  preferredTimeframe?: {
    start: Date;
    end: Date;
  };
  conversationHistory?: string[];
  ticketId?: number;
}

interface AISchedulingSuggestion {
  suggestedTime: Date;
  alternativeTimes: Array<{
    time: Date;
    score: number;
    reason: string;
  }>;
  confidenceScore: number;
  reasoning: string;
}

class AISchedulingService {
  /**
   * Generate AI-powered appointment suggestions
   */
  async generateSuggestions(
    context: AISchedulingContext
  ): Promise<AISchedulingSuggestion> {
    try {
      const {
        companyId,
        contactId,
        serviceId,
        preferredTimeframe
      } = context;

      // Get contact history
      const contact = await Contact.findByPk(contactId, {
        include: [
          {
            model: Appointment,
            as: 'appointments',
            where: { companyId },
            required: false,
            limit: 10,
            order: [['startTime', 'DESC']]
          },
          {
            model: Ticket,
            as: 'tickets',
            where: { companyId },
            required: false,
            limit: 5,
            order: [['createdAt', 'DESC']]
          }
        ]
      });

      // Get service details
      const service = await AppointmentService.findByPk(serviceId);

      if (!service) {
        throw new Error('Service not found');
      }

      // Get available time slots
      const timeframe = preferredTimeframe || {
        start: new Date(),
        end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // Next 14 days
      };

      const availableSlots = await AvailabilityService.getAvailableSlots({
        companyId,
        serviceId,
        startDate: timeframe.start,
        endDate: timeframe.end
      });

      const openSlots = availableSlots.filter(slot => slot.available);

      if (openSlots.length === 0) {
        throw new Error('No available time slots found');
      }

      // Analyze contact patterns
      const patterns = this.analyzeContactPatterns(contact);

      // Build AI prompt
      const prompt = this.buildSchedulingPrompt(
        contact,
        service,
        openSlots,
        patterns,
        context.conversationHistory
      );

      // 🆕 MIGRADO: Usar chatCompletion de AIClientService
      const completion = await chatCompletion({
        messages: [
          {
            role: 'system',
            content: 'You are an intelligent scheduling assistant. Analyze the available time slots and customer patterns to recommend the best appointment times. Respond in JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        maxTokens: 1000,
        companyId,
        module: 'chat'
      });

      const aiResponse = JSON.parse(completion.content || '{}');

      // Parse AI response
      const suggestion: AISchedulingSuggestion = {
        suggestedTime: new Date(aiResponse.suggestedTime),
        alternativeTimes: aiResponse.alternatives?.map((alt: any) => ({
          time: new Date(alt.time),
          score: alt.score,
          reason: alt.reason
        })) || [],
        confidenceScore: aiResponse.confidence || 0.8,
        reasoning: aiResponse.reasoning || 'Based on availability and customer patterns'
      };

      // Save suggestion to database
      // 🆕 MIGRADO: Usar completion.model y calcular tokens totales
      const totalTokens = (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0);
      await AppointmentAISuggestion.create({
        companyId,
        contactId,
        serviceId,
        suggestionType: 'optimal_time',
        suggestedTime: suggestion.suggestedTime,
        confidenceScore: suggestion.confidenceScore,
        reasoning: suggestion.reasoning,
        alternativeTimes: suggestion.alternativeTimes,
        status: 'pending',
        aiModel: completion.model || 'gpt-5.5',
        aiTokensUsed: totalTokens
      });

      logInfo('AI scheduling suggestion generated', {
        companyId,
        contactId,
        serviceId,
        suggestedTime: suggestion.suggestedTime,
        confidence: suggestion.confidenceScore
      });

      return suggestion;
    } catch (error) {
      logError('Error generating AI scheduling suggestion', { error, context });
      throw error;
    }
  }

  /**
   * Analyze contact appointment patterns
   */
  private analyzeContactPatterns(contact: Contact): {
    preferredDayOfWeek: number[];
    preferredTimeOfDay: string[];
    appointmentFrequency: string;
    lastAppointmentDate?: Date;
  } {
    const appointments = contact.appointments || [];

    if (appointments.length === 0) {
      return {
        preferredDayOfWeek: [],
        preferredTimeOfDay: [],
        appointmentFrequency: 'new_customer'
      };
    }

    // Analyze day of week preferences
    const dayFrequency: Record<number, number> = {};
    const hourFrequency: Record<number, number> = {};

    for (const apt of appointments) {
      const day = apt.startTime.getDay();
      const hour = apt.startTime.getHours();

      dayFrequency[day] = (dayFrequency[day] || 0) + 1;
      hourFrequency[hour] = (hourFrequency[hour] || 0) + 1;
    }

    // Get preferred days
    const preferredDays = Object.entries(dayFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([day]) => parseInt(day));

    // Get preferred time of day
    const preferredTimes: string[] = [];
    for (const [hour, count] of Object.entries(hourFrequency)) {
      const h = parseInt(hour);
      if (h < 12) preferredTimes.push('morning');
      else if (h < 17) preferredTimes.push('afternoon');
      else preferredTimes.push('evening');
    }

    // Calculate frequency
    const daysBetween = appointments.length > 1
      ? Math.floor((appointments[0].startTime.getTime() - appointments[appointments.length - 1].startTime.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const avgDaysBetween = daysBetween / (appointments.length - 1 || 1);
    let frequency = 'occasional';
    if (avgDaysBetween < 30) frequency = 'frequent';
    else if (avgDaysBetween < 90) frequency = 'regular';

    return {
      preferredDayOfWeek: preferredDays,
      preferredTimeOfDay: [...new Set(preferredTimes)],
      appointmentFrequency: frequency,
      lastAppointmentDate: appointments[0]?.startTime
    };
  }

  /**
   * Build AI prompt for scheduling
   */
  private buildSchedulingPrompt(
    contact: Contact,
    service: AppointmentService,
    availableSlots: any[],
    patterns: any,
    conversationHistory?: string[]
  ): string {
    const slotsText = availableSlots
      .slice(0, 20) // Limit to top 20 slots
      .map((slot, i) => `${i + 1}. ${slot.start.toISOString()}`)
      .join('\n');

    return `
Recommend the best appointment time for this customer:

Customer Information:
- Name: ${contact.name}
- Appointment History: ${contact.appointments?.length || 0} previous appointments
- Preferred Days: ${patterns.preferredDayOfWeek.join(', ') || 'No preference'}
- Preferred Time: ${patterns.preferredTimeOfDay.join(', ') || 'No preference'}
- Frequency: ${patterns.appointmentFrequency}
${patterns.lastAppointmentDate ? `- Last Appointment: ${patterns.lastAppointmentDate.toISOString()}` : ''}

Service:
- Name: ${service.name}
- Duration: ${service.duration} minutes
- Type: ${service.description || 'General appointment'}

Available Time Slots (next 20):
${slotsText}

${conversationHistory ? `Recent Conversation:\n${conversationHistory.join('\n')}` : ''}

Please analyze and respond in JSON format:
{
  "suggestedTime": "ISO date string of best option",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this is the best time",
  "alternatives": [
    {
      "time": "ISO date string",
      "score": 0.0-1.0,
      "reason": "Why this is a good alternative"
    }
  ]
}

Consider:
1. Customer's historical preferences
2. Time of day that suits service type
3. Optimal spacing from last appointment
4. Business hour optimization
`.trim();
  }

  /**
   * Suggest reschedule time for cancelled/missed appointment
   */
  async suggestReschedule(
    appointmentId: number,
    companyId: number
  ): Promise<AISchedulingSuggestion> {
    try {
      const appointment = await Appointment.findOne({
        where: { id: appointmentId, companyId },
        include: [
          { model: Contact, as: 'contact' },
          { model: AppointmentService, as: 'service' }
        ]
      });

      if (!appointment || !appointment.contact || !appointment.service) {
        throw new Error('Appointment, contact, or service not found');
      }

      // Generate suggestions starting from tomorrow
      const suggestion = await this.generateSuggestions({
        companyId,
        contactId: appointment.contactId,
        serviceId: appointment.serviceId,
        preferredTimeframe: {
          start: new Date(Date.now() + 24 * 60 * 60 * 1000),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        }
      });

      // Update suggestion type
      await AppointmentAISuggestion.update(
        { suggestionType: 'reschedule' },
        {
          where: {
            companyId,
            contactId: appointment.contactId,
            status: 'pending'
          },
          limit: 1
        }
      );

      logInfo('Reschedule suggestion generated', {
        originalAppointmentId: appointmentId,
        suggestedTime: suggestion.suggestedTime
      });

      return suggestion;
    } catch (error) {
      logError('Error suggesting reschedule', { error, appointmentId });
      throw error;
    }
  }

  /**
   * Predict optimal follow-up appointment time
   */
  async predictFollowUp(
    contactId: number,
    companyId: number,
    serviceId: number,
    lastAppointmentId: number
  ): Promise<Date | null> {
    try {
      const lastAppointment = await Appointment.findByPk(lastAppointmentId);

      if (!lastAppointment) {
        return null;
      }

      // Get contact's appointment history
      const appointments = await Appointment.findAll({
        where: {
          contactId,
          companyId,
          status: 'completed'
        },
        order: [['startTime', 'DESC']],
        limit: 5
      });

      if (appointments.length < 2) {
        // Not enough history, suggest 30 days from last appointment
        const followUpDate = new Date(lastAppointment.startTime);
        followUpDate.setDate(followUpDate.getDate() + 30);
        return followUpDate;
      }

      // Calculate average time between appointments
      let totalDays = 0;
      for (let i = 0; i < appointments.length - 1; i++) {
        const days = Math.floor(
          (appointments[i].startTime.getTime() - appointments[i + 1].startTime.getTime()) /
          (1000 * 60 * 60 * 24)
        );
        totalDays += days;
      }

      const avgDays = Math.floor(totalDays / (appointments.length - 1));

      // Predict next appointment date
      const predictedDate = new Date(lastAppointment.startTime);
      predictedDate.setDate(predictedDate.getDate() + avgDays);

      // Save as AI suggestion
      await AppointmentAISuggestion.create({
        companyId,
        contactId,
        serviceId,
        suggestionType: 'follow_up',
        suggestedTime: predictedDate,
        confidenceScore: 0.75,
        reasoning: `Based on ${appointments.length} previous appointments with average interval of ${avgDays} days`,
        status: 'pending',
        aiModel: 'pattern_analysis'
      });

      logInfo('Follow-up prediction generated', {
        contactId,
        predictedDate,
        avgInterval: avgDays
      });

      return predictedDate;
    } catch (error) {
      logError('Error predicting follow-up', { error, contactId });
      return null;
    }
  }

  /**
   * Optimize appointment schedule for a day
   */
  async optimizeSchedule(
    companyId: number,
    userId: number,
    date: Date
  ): Promise<{
    recommendations: Array<{
      appointmentId: number;
      currentTime: Date;
      suggestedTime: Date;
      reason: string;
    }>;
    efficiencyScore: number;
  }> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get appointments for the day
      const appointments = await Appointment.findAll({
        where: {
          companyId,
          userId,
          startTime: { [Op.gte]: startOfDay },
          endTime: { [Op.lte]: endOfDay },
          status: { [Op.notIn]: ['cancelled'] }
        },
        order: [['startTime', 'ASC']]
      });

      // Calculate current efficiency (gaps, buffer times, etc.)
      const recommendations: any[] = [];
      let totalGapTime = 0;

      for (let i = 0; i < appointments.length - 1; i++) {
        const current = appointments[i];
        const next = appointments[i + 1];

        const gapMinutes = Math.floor(
          (next.startTime.getTime() - current.endTime.getTime()) / (1000 * 60)
        );

        totalGapTime += gapMinutes;

        // If gap is too small (<15 min) or too large (>60 min), suggest optimization
        if (gapMinutes < 15 || gapMinutes > 60) {
          recommendations.push({
            appointmentId: next.id,
            currentTime: next.startTime,
            suggestedTime: new Date(current.endTime.getTime() + 30 * 60 * 1000), // 30 min after previous
            reason: gapMinutes < 15
              ? 'Insufficient buffer time between appointments'
              : 'Excessive gap between appointments'
          });
        }
      }

      // Calculate efficiency score (0-1)
      const avgGap = totalGapTime / (appointments.length - 1 || 1);
      const idealGap = 30; // 30 minutes
      const efficiencyScore = Math.max(0, 1 - Math.abs(avgGap - idealGap) / idealGap);

      logInfo('Schedule optimization completed', {
        companyId,
        userId,
        date,
        appointmentsCount: appointments.length,
        recommendationsCount: recommendations.length,
        efficiencyScore
      });

      return {
        recommendations,
        efficiencyScore
      };
    } catch (error) {
      logError('Error optimizing schedule', { error, companyId, userId, date });
      throw error;
    }
  }

  /**
   * Get AI suggestions for a contact
   */
  async getSuggestionsForContact(
    contactId: number,
    companyId: number,
    status: string = 'pending'
  ): Promise<AppointmentAISuggestion[]> {
    try {
      const suggestions = await AppointmentAISuggestion.findAll({
        where: {
          contactId,
          companyId,
          status
        },
        order: [['createdAt', 'DESC']],
        limit: 10
      });

      return suggestions;
    } catch (error) {
      logError('Error getting AI suggestions', { error, contactId });
      throw error;
    }
  }

  /**
   * Mark suggestion as applied
   */
  async applySuggestion(suggestionId: number, companyId: number): Promise<void> {
    try {
      await AppointmentAISuggestion.update(
        {
          status: 'accepted',
          appliedAt: new Date()
        },
        {
          where: { id: suggestionId, companyId }
        }
      );

      logInfo('AI suggestion applied', { suggestionId });
    } catch (error) {
      logError('Error applying suggestion', { error, suggestionId });
      throw error;
    }
  }
}

export default new AISchedulingService();

