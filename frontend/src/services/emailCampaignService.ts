import api from './api'

// ========== Email Campaigns ==========

export const listEmailCampaigns = async (params?: {
  searchParam?: string
  pageNumber?: string | number
}) => {
  const { data } = await api.get('/email-campaigns', { params })
  return data
}

export const createEmailCampaign = async (campaignData: {
  name: string
  subject: string
  htmlContent?: string
  contactListId?: number
  tagListId?: number | string
  sendAt?: string
}) => {
  const { data } = await api.post('/email-campaigns', campaignData)
  return data
}

export const createAndLaunchCampaign = async (campaignData: {
  name: string
  subject: string
  from_email: string
  from_name: string
  reply_to: string
  mail_list_uid: string
  html: string
  run_at?: string
  launch_now?: boolean
  track_open?: boolean
  track_click?: boolean
  sign_dkim?: boolean
}) => {
  const { data } = await api.post('/email-campaigns/create-and-launch', campaignData)
  return data
}

export const showEmailCampaign = async (id: number | string) => {
  const { data } = await api.get(`/email-campaigns/${id}`)
  return data
}

export const updateEmailCampaign = async (
  id: number | string,
  campaignData: Record<string, any>
) => {
  const { data } = await api.put(`/email-campaigns/${id}`, campaignData)
  return data
}

export const deleteEmailCampaign = async (id: number | string) => {
  const { data } = await api.delete(`/email-campaigns/${id}`)
  return data
}

export const uploadCampaignMedia = async (id: number | string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post(`/email-campaigns/${id}/media-upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const deleteCampaignMedia = async (id: number | string) => {
  const { data } = await api.delete(`/email-campaigns/${id}/media-upload`)
  return data
}

export const cancelCampaign = async (id: number | string) => {
  const { data } = await api.post(`/email-campaigns/${id}/cancel`)
  return data
}

export const restartCampaign = async (id: number | string) => {
  const { data } = await api.post(`/email-campaigns/${id}/restart`)
  return data
}

// ========== Contact Lists ==========

export const listContactLists = async (params?: {
  searchParam?: string
  pageNumber?: string | number
}) => {
  const { data } = await api.get('/contact-lists', { params })
  return data
}

export const listContactListsAll = async () => {
  const { data } = await api.get('/contact-lists/list')
  return data
}

export const createContactList = async (listData: {
  name: string
  isEmailList?: boolean
  fromEmail?: string
  fromName?: string
  contactCompany?: string
  contactState?: string
  contactAddress1?: string
  contactAddress2?: string
  contactCity?: string
  contactZip?: string
  contactPhone?: string
  contactCountryId?: string
  contactEmail?: string
  contactUrl?: string
  subscribeConfirmation?: boolean
  sendWelcomeEmail?: boolean
  unsubscribeNotification?: boolean
}) => {
  const { data } = await api.post('/contact-lists', listData)
  return data
}

export const showContactList = async (id: number | string) => {
  const { data } = await api.get(`/contact-lists/${id}`)
  return data
}

export const updateContactList = async (
  id: number | string,
  listData: Record<string, any>
) => {
  const { data } = await api.put(`/contact-lists/${id}`, listData)
  return data
}

export const deleteContactList = async (id: number | string) => {
  const { data } = await api.delete(`/contact-lists/${id}`)
  return data
}

export const uploadContactsToList = async (id: number | string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post(`/contact-lists/${id}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

// ========== Contact List Items ==========

export const listContactListItems = async (params: {
  contactListId: number | string
  searchParam?: string
  pageNumber?: string | number
}) => {
  const { data } = await api.get('/contact-list-items', { params })
  return data
}

export const createContactListItem = async (itemData: {
  name: string
  number?: string
  email?: string
  contactListId: number
}) => {
  const { data } = await api.post('/contact-list-items', itemData)
  return data
}

export const updateContactListItem = async (
  id: number | string,
  itemData: Record<string, any>
) => {
  const { data } = await api.put(`/contact-list-items/${id}`, itemData)
  return data
}

export const deleteContactListItem = async (id: number | string) => {
  const { data } = await api.delete(`/contact-list-items/${id}`)
  return data
}

// ========== Email Templates ==========

export const listEmailTemplates = async (params?: {
  searchParam?: string
  pageNumber?: string | number
}) => {
  const { data } = await api.get('/email-templates', { params })
  return data
}

export const createEmailTemplate = async (templateData: {
  name: string
  subject: string
  htmlContent: string
  category?: string
}) => {
  const { data } = await api.post('/email-templates', templateData)
  return data
}

export const showEmailTemplate = async (id: number | string) => {
  const { data } = await api.get(`/email-templates/${id}`)
  return data
}

export const updateEmailTemplate = async (
  id: number | string,
  templateData: Record<string, any>
) => {
  const { data } = await api.put(`/email-templates/${id}`, templateData)
  return data
}

export const deleteEmailTemplate = async (id: number | string) => {
  const { data } = await api.delete(`/email-templates/${id}`)
  return data
}
