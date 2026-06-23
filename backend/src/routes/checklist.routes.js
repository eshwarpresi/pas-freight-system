function parseChecklistText(text) {
  var result = {
    referenceNumber: '', shipmentMode: '', importerName: '', exporterName: '',
    supplierName: '', location: '', jobOrderNo: '', jobOrderDate: '',
    boeSbNo: '', boeSbDate: '', mawbMblNo: '', mawbMblDate: '',
    hawbHblNo: '', hawbHblDate: '', noOfPackages: '', grossWeight: '',
    igmNo: '', igmDate: '', portOfDischarge: '', portOfDestination: '',
    cargoArrivalNotice: '', cargoArrivalDate: '', deliveryOrderDate: '',
    occDate: '', gatePassDate: '', remarks: '', invoiceNo: '', invoiceDate: '',
    agentDebitNote: '', billingCurrency: '', billNo: '', billDate: '',
    billTo: '', billToDate: '', docketNo: '', docketDate: '', additionalRemarks: ''
  };

  // Clean up text - collapse multiple spaces
  var cleanText = text.replace(/\s+/g, ' ').trim();
  
  // Helper to extract value after a label
  function extract(label) {
    var regex = new RegExp(label + '[\\s:]+([^\\n]+?)(?=\\s{2,}|$)', 'i');
    var match = cleanText.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
    return '';
  }

  // Helper to extract value between two labels
  function extractBetween(startLabel, endLabel) {
    var startIdx = cleanText.toLowerCase().indexOf(startLabel.toLowerCase());
    if (startIdx === -1) return '';
    var afterStart = cleanText.substring(startIdx + startLabel.length).replace(/^[\s:]+/, '').trim();
    if (endLabel) {
      var endIdx = afterStart.toLowerCase().indexOf(endLabel.toLowerCase());
      if (endIdx > 0) return afterStart.substring(0, endIdx).trim();
    }
    // Return first 100 chars if no end label
    return afterStart.substring(0, 100).trim();
  }

  // === EXTRACTIONS BASED ON YOUR PDF FORMAT ===

  // B.E No
  var beMatch = cleanText.match(/B\.?E\s*No[,\s]*Date\s*:\s*([^\s]+)/i);
  if (beMatch) result.boeSbNo = beMatch[1];

  // Job No & Date
  var jobMatch = cleanText.match(/Job\s*No\s*[&]?\s*Date\s*:\s*(\d+)\s*[&]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (jobMatch) {
    result.jobOrderNo = jobMatch[1];
    result.jobOrderDate = jobMatch[2];
  }

  // Transport Mode
  var modeMatch = cleanText.match(/Transport\s*Mode\s*:\s*(\w+)/i);
  if (modeMatch) result.shipmentMode = modeMatch[1];

  // Importer Details
  var importerMatch = cleanText.match(/Importer\s*Details\s*:[\s\d]*([A-Z]{5}\d{4}[A-Z]\d{3}[A-Z]{3}\d{1})/i);
  if (importerMatch) {
    // The importer name comes after the code
    var afterCode = cleanText.substring(cleanText.indexOf(importerMatch[1]) + importerMatch[1].length);
    // Get company name - it's usually in ALL CAPS after PAN
    var nameMatch = afterCode.match(/([A-Z]{3,}[A-Z\s]{5,}(?:PRIVATE|PVT|LIMITED|LTD|INC|CORP)[A-Z\s]*)/i);
    if (nameMatch) result.importerName = nameMatch[1].trim();
  }

  // MBL/MAWB
  var mblMatch = cleanText.match(/MBL\/\s*MAWB\s*:\s*(\d+)/i);
  if (mblMatch) result.mawbMblNo = mblMatch[1];
  var mblDateMatch = cleanText.match(/MBL\/\s*MAWB\s*:[\s\d]+\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (mblDateMatch) result.mawbMblDate = mblDateMatch[1];

  // HBL/HAWB
  var hblMatch = cleanText.match(/HBL\/\s*HAWB\s*:\s*([A-Z0-9]+)/i);
  if (hblMatch) result.hawbHblNo = hblMatch[1];
  var hblDateMatch = cleanText.match(/HBL\/\s*HAWB\s*:[\s\w]+\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (hblDateMatch) result.hawbHblDate = hblDateMatch[1];

  // No. of Pkgs
  var pkgMatch = cleanText.match(/No\.?\s*of\s*Pkgs\s*:\s*(\d+)\s*PKG/i);
  if (pkgMatch) result.noOfPackages = pkgMatch[1];

  // Gross Weight
  var wtMatch = cleanText.match(/Gross\s*Weight\s*:\s*([\d.]+\s*KGS)/i);
  if (wtMatch) result.grossWeight = wtMatch[1];

  // Port Origin
  var poMatch = cleanText.match(/Port\s*Origin\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (poMatch) result.portOfDischarge = poMatch[1];

  // Port Shipment
  var psMatch = cleanText.match(/Port\s*Shipment\s*:\s*([A-Z]+-[A-Z]+)/i);
  if (psMatch) result.portOfDestination = psMatch[1];

  // Invoice Details
  var invNoMatch = cleanText.match(/Inv\.?\s*No\s*:\s*(\d+)/i);
  if (invNoMatch) result.invoiceNo = invNoMatch[1];
  var invDateMatch = cleanText.match(/Inv\.?\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (invDateMatch) result.invoiceDate = invDateMatch[1];
  var invValMatch = cleanText.match(/Inv\.?\s*Value\s*:\s*([\d.]+\s*[A-Z]{3})/i);
  if (invValMatch) result.billingCurrency = invValMatch[1];

  // Supplier Details
  var supplierMatch = cleanText.match(/SUPPLIER\s*DETAILS[\s-]+(?:Inv\.?Sl\.?No\s*:\s*\d+\s*)?([A-Z][A-Z\s]{5,}(?:PTE|PVT|LTD|INC|CORP|LIMITED)[A-Z\s]*)/i);
  if (supplierMatch) result.supplierName = supplierMatch[1].trim();

  // Location / Port of Filing
  var locMatch = cleanText.match(/Port\s*Of\s*Filing\s*:\s*([^,]+)/i);
  if (locMatch) result.location = locMatch[1].trim();

  // File No / Reference
  var refMatch = cleanText.match(/File\s*No\s*:\s*([^\s]+)/i);
  if (refMatch) result.referenceNumber = refMatch[1];

  // If any field still empty, try generic extraction
  if (!result.jobOrderNo) result.jobOrderNo = extract('Job\\s*No');
  if (!result.mawbMblNo) result.mawbMblNo = extract('MBL\\s*[/]?\\s*MAWB');
  if (!result.hawbHblNo) result.hawbHblNo = extract('HBL\\s*[/]?\\s*HAWB');
  if (!result.noOfPackages) result.noOfPackages = extract('No\\.?\\s*of\\s*Pkgs');
  if (!result.grossWeight) result.grossWeight = extract('Gross\\s*Weight');
  if (!result.invoiceNo) result.invoiceNo = extract('Inv\\.?\\s*No');
  if (!result.shipmentMode) result.shipmentMode = extract('Transport\\s*Mode');

  return result;
}