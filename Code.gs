/**
 * This file is a Google Apps Script
 * that creates a Google Form based on a Google Sheet.
 */

var SSID = "1WNGfctavKuY-3MFrRkMbp0enSwg0x71dtUjo-edTSBI"; // Nudie.Bikes
var SSID_PRIVATE = "1mXmnQzyZmZArWJ3iuhEWKqj0qEo5nbDzbARLGWaxJUk"; // Nudie.Bikes-private
var BET_META_NAME = "Which bet do you want to place?";
var WAGER_NAME = "Wager";

function buildForm() {
    // Get the form bound to the container.
    var f = FormApp.getActiveForm();

    // Get the sheet bound to the container.
    var ss = SpreadsheetApp.openById(SSID);

    // Get the list of questions from the spreadsheet.
    // These are in a sheet called "Overview" in the named range BetsIndex.
    // The first row contains the name of the sheet that has more metadata
    // about each question. The second row contains the question text.
    var questions = ss.getSheetByName("Overview").getRange("BetsIndex").getValues()
        .filter(function(q) { return q[1] !== ""; });

    var minBetUsd = ss.getSheetByName("Overview").getRange("MinBet").getValue();

    // Set the metadata (title, description) of the form.
    f.setTitle("Place a new[die] bet")
        .setDescription("Submit a new wager on Nudes' ride.");

    // Remove all existing items from the form.
    var items = f.getItems();
    for (var i = 0; i < items.length; i++) {
        f.deleteItem(items[i]);
    }

    // Create a single dropdown question about which question to answer.
    // This will be the first question in the form.
    var metaQuestion = f.addListItem()
        .setTitle(BET_META_NAME)
        .setRequired(true);

    // List of metaq choices.
    var metaQuestionChoices = [];

    // List of page breaks after the inner questions.
    var innerBreaks = [];

    // Add a multiple choice question for each question in the spreadsheet.
    for (var i = 0; i < questions.length; i++) {
        var sheet = questions[i][0];
        var question = questions[i][1];

        // Description is in the metadata sheet in B2.
        var description = ss.getSheetByName(sheet).getRange("$B$2").getValue();

        // Type is in the metadata sheet in B3.
        var qType = ss.getSheetByName(sheet).getRange("$B$3").getValue();

        // Depending on which choice is selected, the next question will be
        // different. This is done by adding a page break after each question
        // and setting the next page based on the choice.
        var pageBreak = f.addPageBreakItem()
            .setTitle(question)
            .setHelpText(description);
        innerBreaks.push(pageBreak);

        // Add the question as an option to `metaQuestion`,
        // with a jump to the page break.
        metaQuestionChoices.push(metaQuestion.createChoice(question, pageBreak));

        // Add new question based on type.
        switch (qType) {
            case "Multiple Choice":
                // The options are read from the A range of the metadata sheet.
                var options = ss.getSheetByName(sheet).getRange("$A$5:$A").getValues()
                    .filter(function(o) { return o[0] !== ""; })
                var mc = f.addMultipleChoiceItem()
                    .setTitle(question)
                    .setRequired(true);
                // Create choices from the options.
                mc.setChoices(options.map(function(o) { return mc.createChoice(o); }));
                break;
            case "Date":
                f.addDateItem()
                    .setTitle(question)
                    .setRequired(true);
                break;
            default:
                throw "Unknown question type: " + qType;
        }
    }

    // Set the choices for the meta question.
    metaQuestion.setChoices(metaQuestionChoices);

    // Add a section break.
    var lastPageBreak = f.addPageBreakItem();

    // Set all the inner questions to jump to this last break.
    innerBreaks.forEach(function(b) { b.setGoToPage(lastPageBreak); });

    // Lastly, add an entry field for the Wager. The wager must be a positive
    // number (USD) and is required.
    f.addTextItem()
        .setTitle(WAGER_NAME)
        .setHelpText("Enter the amount you want to bet, in US dollars. Must be at least $" + minBetUsd + ". You should Venmo this amount to @joenudell after you submit!")
        .setRequired(true)
        .setValidation(FormApp.createTextValidation()
            .setHelpText("Wager must be at least $" + minBetUsd + " (USD).")
            .requireNumberGreaterThanOrEqualTo(minBetUsd)
            .build());

}


/**
 * Record the response in the spreadsheet.
 */
function handleSubmit(e) {
        // Get the spreadsheet where we store results.
        var ss = SpreadsheetApp.openById(SSID);
        var ssPriv = SpreadsheetApp.openById(SSID_PRIVATE);

        var questions = ss.getSheetByName("Overview").getRange("BetsIndex").getValues()
            .filter(function(q) { return q[1] !== ""; });

        // Make a lookup table from question to sheet name.
        var questionToSheet = questions.reduce(function(map, q) {
            map[q[1]] = q[0];
            return map;
        }, {});

        // Get the response sheets.
        var rs = ssPriv.getSheetByName("Bets");
        var pubRs = ss.getSheetByName("Bets");

        var lock = LockService.getPublicLock();
        lock.waitLock(30000);

        // Get the next row in this response sheet.
        var nextRow = rs.getLastRow() + 1;

        // Assemble named values
        var namedValues = e.response.getItemResponses()
            .reduce(function(map, itemResponse) {
                map[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
                return map;
            }, {});

        // Write the private data response including the email
        var question = namedValues[BET_META_NAME];
        var sheet = questionToSheet[question];
        rs.getRange(nextRow, 1).setValue(e.response.getId());
        rs.getRange(nextRow, 2).setValue(new Date());
        rs.getRange(nextRow, 3).setValue(sheet);
        rs.getRange(nextRow, 4).setValue(namedValues[question]);
        rs.getRange(nextRow, 5).setValue(namedValues[WAGER_NAME]);
        rs.getRange(nextRow, 6).setValue("FALSE");
        rs.getRange(nextRow, 7).setValue(e.response.getRespondentEmail());

        // Write a view to the private data in the public sheet.
        var nextPubRow = pubRs.getLastRow() + 1;
        pubRs.getRange(nextPubRow, 1).setValue("=importrange(\"" + SSID_PRIVATE + "\", \"Bets!$A$" + nextRow + "\")");
        pubRs.getRange(nextPubRow, 2).setValue("=importrange(\"" + SSID_PRIVATE + "\", \"Bets!$B$" + nextRow + "\")");
        pubRs.getRange(nextPubRow, 3).setValue("=importrange(\"" + SSID_PRIVATE + "\", \"Bets!$C$" + nextRow + "\")");
        pubRs.getRange(nextPubRow, 4).setValue("=importrange(\"" + SSID_PRIVATE + "\", \"Bets!$D$" + nextRow + "\")");
        pubRs.getRange(nextPubRow, 5).setValue("=importrange(\"" + SSID_PRIVATE + "\", \"Bets!$E$" + nextRow + "\")");
        pubRs.getRange(nextPubRow, 6).setValue("=importrange(\"" + SSID_PRIVATE + "\", \"Bets!$F$" + nextRow + "\")");

        lock.releaseLock();
}