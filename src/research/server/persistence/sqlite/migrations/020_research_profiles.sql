ALTER TABLE research_requests
  ADD COLUMN research_profile_json TEXT NOT NULL DEFAULT '{"investmentHorizon":"medium","counterargumentIntensity":"standard","analysisDepth":"standard","decisionPurpose":"new_entry","comparisonSymbols":[]}';
