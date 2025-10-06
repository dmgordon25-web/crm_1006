// presets.js — default CSV mappings + header aliases for v5 headers
window.CSV_PRESETS = {
  partnersDefault: {
    partnerId:'partnerId', name:'name', company:'company', email:'email', phone:'phone'
  },
  contactsDefault: {
    first:'first', last:'last', email:'email', phone:'phone', address:'address', city:'city', state:'state', zip:'zip',
    referredBy:'referredBy', loanType:'loanType', stage:'stage', loanAmount:'loanAmount', rate:'rate', fundedDate:'fundedDate',
    status:'status', notes:'notes', contactId:'contactId',
    buyerPartnerId:'buyerPartnerId', buyerPartnerName:'buyerPartnerName', buyerPartnerCompany:'buyerPartnerCompany',
    buyerPartnerEmail:'buyerPartnerEmail', buyerPartnerPhone:'buyerPartnerPhone',
    listingPartnerId:'listingPartnerId', listingPartnerName:'listingPartnerName', listingPartnerCompany:'listingPartnerCompany',
    listingPartnerEmail:'listingPartnerEmail', listingPartnerPhone:'listingPartnerPhone',
    partnerLinkStatus:'partnerLinkStatus'
  }
};

// Common header aliases to auto-map (case-insensitive)
window.CSV_PRESETS.headerAliases = {
  partners: {
    partnerId: ['id','partner id','partner_id'],
    name: ['partner name','name'],
    company: ['company name','org','organization','company'],
    email: ['email address','e-mail','email'],
    phone: ['phone number','mobile','cell','phone']
  },
  contacts: {
    contactId: ['id','contact id','uuid','guid','contact_id'],
    first: ['first name','borrower first','fname','given name','first'],
    last: ['last name','borrower last','lname','surname','last'],
    email: ['email address','e-mail','email'],
    phone: ['phone number','mobile','cell','phone'],
    address: ['street','street address','address1','address line 1'],
    city: ['town','city'],
    state: ['province','state/region','state'],
    zip: ['postal','postal code','zip code','zip'],
    referredBy: ['referrer','partner','referred by','referral source'],
    loanType: ['type','loan type','product'],
    stage: ['pipeline stage','status stage','stage'],
    loanAmount: ['amount','loan amount','loan $','amount $'],
    rate: ['interest','rate %','interest rate','rate'],
    fundedDate: ['funded date','closing date','close date','funded'],
    status: ['status'],
    notes: ['note','comments','notes'],

    buyerPartnerId: ['buyer partner id','buying partner id','buyer_partner_id'],
    buyerPartnerName: ['buyer partner name','buying partner name'],
    buyerPartnerCompany: ['buyer partner company','buying partner company'],
    buyerPartnerEmail: ['buyer partner email','buying partner email'],
    buyerPartnerPhone: ['buyer partner phone','buying partner phone'],

    listingPartnerId: ['listing partner id','selling partner id','listing_partner_id'],
    listingPartnerName: ['listing partner name','selling partner name'],
    listingPartnerCompany: ['listing partner company','selling partner company'],
    listingPartnerEmail: ['listing partner email','selling partner email'],
    listingPartnerPhone: ['listing partner phone','selling partner phone'],

    partnerLinkStatus: ['partner link status','link status']
  }
};
