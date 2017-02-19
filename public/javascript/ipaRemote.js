'use strict';
// Service names
var IPA_DIALOG_NAME = "demo_iti_chatbothelpdesk"; // REPLACE with your own name
var IPA_CLASSIFIER_NAME = "demo_ipa";  // NO NEED TO RENAME THIS ONE unless you want to

// Intent Types
var INTENT_TYPE_DIALOG_EMAIL = "email-issue";
var INTENT_TYPE_WIRED_NETWORK = "web-network-issue";
var INTENT_TYPE_WIRELESS_NETWORK = "wireless-network-issue";

var intentType = null;
var ipaDialog = null;
var ipaNlcClassifier = null;
var conversation = null;

var $dialogsLoading = $('.dialogs-loading');
var $dialogsError = $('.dialogs-error');

// conversation nodes
var $conversationDiv = $('.conversation-div');
var $conversation = $('.conversation-container');
var $information = $('.information-container');
var $profileContainer = $('.profile-container');
var $userInput = $('.user-input');
var $userChoice = $('.input-choice');

// initial load
$(document).ready(function() {
    retrieveDialogs();

    //$('.input-choice').click(conductConversationChoice);
    $('.input-btn').click(conductConversation);
    $userInput.keyup(function(event){
        if(event.keyCode === 13) {
            conductConversation();
        }
    });
});

function retrieveDialogs() {
    $dialogsLoading.show();
    $dialogsError.hide();

    $.get('/proxy/api/v1/dialogs?proxyType=dialog')
        .done(function(data) {
            if (data != '') {
                data.dialogs.forEach(function(dialog, index) {
                    if (dialog.name == IPA_DIALOG_NAME) {
                        ipaDialog = dialog;
                    }
                });
            }

            if (ipaDialog == null) {
                $dialogsLoading.hide();
                $dialogsError.find('.errorMsg').html('No dialog named "' + IPA_DIALOG_NAME + '" found in the Dialog service');
                $dialogsError.show();
            }else{
                retrieveClassifiers();
            }
        }).fail(function() {
            $dialogsLoading.hide();
            $dialogsError.show();
            $dialogsError.find('.errorMsg').html('Error getting the dialogs.');
        })
}

function retrieveClassifiers() {

    $.get('/proxy/api/v1/classifiers?proxyType=nlc')
        .done(function(data) {
            if (data != '') {
                data.classifiers.forEach(function(classifier, index) {
                    if (classifier.name == IPA_CLASSIFIER_NAME) {
                        ipaNlcClassifier = classifier;
                    }
                });
            }

            if (ipaNlcClassifier == null) {
                $dialogsLoading.hide();
                $dialogsError.find('.errorMsg').html('No NLC classifier named "' + IPA_CLASSIFIER_NAME + '" found in the NLC service');
                $dialogsError.show();
            }else{
                initConversation(true);
            }
        }).fail(function() {
            $dialogsLoading.hide();
            $dialogsError.show();
            $dialogsError.find('.errorMsg').html('Error getting the NLC classifier.');
        })
}

function initConversation(isFirstConversation) {

    intentType = null;
    conversation = {};
    conversation.user = {};
    conversation.watson = {};
    conversation.user.inputs = [];
    conversation.user.intents = [];
    conversation.watson.replies = [];

    var conversationStartText = "";
    if (!isFirstConversation) {
        // Results in different starting text for dialog.  E.g. "What else can I help with?" vs "Hello! How can I help you?".
        conversationStartText = "DIALOG_START_OVER";
    }
    $.post('/proxy/api/v1/dialogs/' + ipaDialog.dialog_id + '/conversation?proxyType=dialog', {input: conversationStartText})
        .done(function(data) {
            //$conversation.empty();
            $information.empty();
            $dialogsLoading.hide();

            // save dialog, client and conversation id
            conversation.conversation_id = data.conversation_id;
            conversation.client_id = data.client_id;
            conversation.dialog_id = ipaDialog.dialog_id;
            $('<div/>').text('Dialog name: ' + ipaDialog.name).appendTo($information);
            $('<div/>').text('Dialog id: ' + conversation.dialog_id).appendTo($information);
            $('<div/>').text('Conversation id: ' + conversation.conversation_id).appendTo($information);
            $('<div/>').text('Client id: ' + conversation.client_id).appendTo($information);

            var text = data.response.join('<br/>');
            displayWatsonChat(text);
        });
}

function saveConversation(userIntentText,userIntentType,watsonReply) {

    // Update conversation store
    conversation.user.inputs[conversation.user.inputs.length] = userIntentText;
    conversation.user.intents[conversation.user.intents.length] = userIntentType;
    conversation.watson.replies[conversation.watson.replies.length] = watsonReply;

    var conversationJson = JSON.stringify(conversation);
    $.ajax( {
        url: '/saveConversation',
        type: 'POST',
        data: conversationJson,
        contentType: 'application/json',
        processData: false,
        success: function (response) {
            console.log("conversationJson sent to server");
        },
        error: function (xhr, ajaxOptions, thrownError) {
            console.log("Error: " + xhr.status + "\n" + xhr.responseText + "\n" + JSON.stringify(thrownError));
        }
    } );
}

/**
 * Let Watson Dialog Services help us out
 */
function handOffToDialog(userIntentText) {

    var dialogInput = userIntentText;
    if (isDialogRequiredIntent()) {
        // Use the invite type to redirect the Dialog flow to the current intent.
        dialogInput = intentType + " " + userIntentText;
    }

    var path = '/proxy/api/v1/dialogs/' + conversation.dialog_id + '/conversation?proxyType=dialog';
    var params = {
        input: dialogInput,
        conversation_id: conversation.conversation_id,
        client_id: conversation.client_id
    };
    console.log("Doe it go to the post request")
    $.post(path, params).done(function(data) {
        var replyText = data.response.join('<br/>');

        // Determine if current dialog completed
        var index = replyText.indexOf("DIALOG_COMPLETED");
        var dialogCompleted = index >= 0;
        if (dialogCompleted) {
            replyText = replyText.substring(0,index-5); // also remove the "<br/>"
        }
        displayWatsonChat(replyText);
        if(replyText.indexOf("(y/n)") != -1){
            var args = ["Yes", "No"]
            displayHumanChoices.apply(null, args);
        }else if(replyText.indexOf("(staff/student)") != -1){
            var args = ["Staff", "Student"]
            displayHumanChoices.apply(null, args);
        }else if(replyText.indexOf("(web/client)") != -1){
            var args = ["Web mail", "Email client"]
            displayHumanChoices.apply(null, args);
        }else if(replyText.indexOf("(slow/down)") != -1){
            var args = ["Slow", "Down"]
            displayHumanChoices.apply(null, args);
        }else if(replyText.indexOf("(many/justme)") != -1){
            var args = ["Many", "Just me"]
            displayHumanChoices.apply(null, args);
        }else if(replyText.indexOf("(mac/windows)") != -1){
            var args = ["Mac/Linux", "Windows"]
            displayHumanChoices.apply(null, args);
        }
        getProfile();
        saveConversation(userIntentText,intentType,replyText);

        if (replyText.indexOf("I will send it to our team.") != -1){
            var data = {}
            data.description = replyText;

            $.ajax({
                url: '/sendMail',
                type: 'POST',
                data: JSON.stringify(data),
                contentType: 'application/json',
                processData: false,
                success: function (response) {
                    console.log("email text is sent to server");
                },
                error: function (xhr, ajaxOptions, thrownError) {
                    console.log("Error: " + xhr.status + "\n" + xhr.responseText + "\n" + JSON.stringify(thrownError));
                }

            });

        }
        if (dialogCompleted) {
            initConversation(false);
        }
        updateScroll()
    }).fail(function(response){
        displayWatsonChat("I'm unable to process your request at the moment.");
        updateScroll()
    });
}

/**
 * Determine how we should respond
 */
function conductConversation() {

    var userIntentText = $userInput.val();
    $userInput.val('').focus();
    console.log(conversation.watson.replies.length)
    if (userIntentText == "") {
         displayWatsonChat("Please speak up.  I can't hear you");

    }else if(conversation.watson.replies.length!= 0 && conversation.watson.replies[conversation.watson.replies.length-1].indexOf("email address?") != -1){
         var atpos = userIntentText.indexOf("@");
         var dotpos = userIntentText.lastIndexOf(".");
         if (atpos<1 || dotpos<atpos+2 || dotpos+2>=userIntentText.length) {
             displayWatsonChat("Please, enter valid email address, including '@' and '.' .");
         }else{
            displayHumanChat(userIntentText); 
            handOffToDialog(userIntentText);
         }
    }else if(conversation.watson.replies.length!= 0 && conversation.watson.replies[conversation.watson.replies.length-1].indexOf("telephone number?") != -1){
        if(userIntentText.match(/\d/g) && userIntentText.length<=12){

            displayHumanChat(userIntentText); 
            handOffToDialog(userIntentText);
        }else{
            displayWatsonChat("Please, enter valid telephone number, including only less than 12 digits.");
        }
    }else if(conversation.watson.replies.length!= 0 && conversation.watson.replies[conversation.watson.replies.length-1].indexOf("(describe)") != -1){
            displayHumanChat(userIntentText); 
            determineUserIntent(userIntentText);
    }else {
        displayHumanChat(userIntentText); 
        handOffToDialog(userIntentText);
        console.log("goes to handOFDialog")
    }
}


function conductConversationChoice(choice) {
    //var userIntentText = $userChoice.text();
    var userIntentText = choice;

    handOffToDialog(userIntentText);
}

function getProfile() {
    var path = '/proxy/api/v1/dialogs/' + conversation.dialog_id + '/profile?proxyType=dialog';
    var params = {
        conversation_id: conversation.conversation_id,
        client_id: conversation.client_id
    };

    var attendee1Found = false;
    var timeFound = false;
    var dateFound = false;
    $.get(path, params).done(function(data) {
        $profileContainer.empty();
        data.name_values.forEach(function(par) {
            if (par.value !== '') {
                $('<div/>').text(par.name + ': ' + par.value).appendTo($profileContainer);
            }
        });
    });
}

function getReplyToIntent(nlcResponse, userText)
{
    var replyText = null;
    intentType = nlcResponse.top_class;
    console.log(userText + ": " + nlcResponse.top_class);
    switch (intentType) {
        case INTENT_TYPE_DIALOG_EMAIL:
            break;
        case INTENT_TYPE_WIRED_NETWORK:
            break;
        case INTENT_TYPE_WIRELESS_NETWORK:
            break;
        default:
            replyText = "Sorry.  I don't understand your question.";
            break;
    }
    return replyText;
}

function displayWatsonChat(text) {
        function appendQuestion(explanantionText){
            var $watsonTextWrapper = $('<div class="watson-wrapper"/>')
            var $explanantionFormat = $('<div class="explanantion"><div class="explanantion-text">' + explanantionText + '</div><div class="explanantion-sign"><i class="fa fa-question" aria-hidden="true"></i></div></div>')
            $('<div class="bubble-watson"><div class="team-picture"/>' + text + '</div>')
            .appendTo($watsonTextWrapper);
            $explanantionFormat.appendTo($watsonTextWrapper)
            $watsonTextWrapper.appendTo($conversation)
        }
        if(text.indexOf("(web/client)") != -1){
            var expText = "<p><b>Email client:</b> A program or Application, such as Outlook, Mac Mail or an email app on your phone.</p><p><b>Web Mail:</b> Accessed directly through a web browser, via mail.bham.ac.uk, outlook.bham.ac.uk or through the portal at my.bham.ac.uk</p>";
            appendQuestion(expText)
        }else if(text.indexOf("(computer name)") != -1){
            var expText = "<p><b>On computers running windows</b>, this can be found on the desktop background under “computer name” (for University PCs) or by going to Start Menu, right click on “Computer” and select “properties” and then it will be displayed near the bottom of the window.</p><p><b>On Mac computers</b> it will be the name of the computer, go to the apple icon in the top left of the screen, choose “System Preferences” from the menu, then select “Sharing”. The name of the Mac will be visible at the top of this page.</p>";
            appendQuestion(expText)
        }else if(text.indexOf("(mac address)") != -1){
            var expText = '<p>There are various ways to find the MAC address (or physical address) of your computer, depending on the make and the operating system it runs. Visit <a class="mac-address-link" href="http://www.wikihow.com/Find-the-MAC-Address-of-Your-Computer" target="_blank">this link</a> for more details on how to get your MAC address based on your device.</p>';
            appendQuestion(expText)
        }else if(text.indexOf("(network point number)") != -1){
            var expText = '<p>This will be found on a sticker located above or below the port that your computer connects to the wall using an Ethernet cable. It will usually start with 2 or 3 letters to indicate your building name (ML for Main Library, for example) and then a selection of numbers. The port is often found next to a telephone socket with a similar number above.</p>';
            appendQuestion(expText)
        }else if(text.indexOf("(network SSID)") != -1){
            var expText = '<p>This is the specific name for the network that you are trying to connect to. On campus, these are UOBWifi, Eduroam, WifiGuest and UOBEvents.</p>';
            appendQuestion(expText)
        }else{
            $('<div class="bubble-watson"><div class="team-picture"/>' + text + '</div>')
            .appendTo($conversation);
        }
        updateScroll()
}

function displayHumanChoices() {
    var $choicediv = $('<div class="user-choice"/>').append('<div class="human-picture"/>');
    for(var i=0; i<arguments.length; i++){
        $choicediv.append($('<button class="input-choice" onclick="conductConversationChoice($(this).text());">').html(arguments[i]))
    }
    $choicediv.appendTo($conversation);
    updateScroll()
}

function displayHumanChat(text) {

    $('<div class="bubble-human"><div class="human-picture"/>' + text + '</div>')
        .appendTo($conversation);

    $('<div class="clear-float"/>')
        .appendTo($conversation);

    updateScroll()
}

function isDialogRequiredIntent() {
    return intentType == INTENT_TYPE_DIALOG_EMAIL || intentType == INTENT_TYPE_WIRED_NETWORK || intentType == INTENT_TYPE_WIRELESS_NETWORK;
}

function determineUserIntent(userIntentText) {

    var encodedText = encodeURIComponent(userIntentText);
    $.get('/proxy/api/v1/classifiers/' + ipaNlcClassifier.classifier_id + '/classify?proxyType=nlc&text=' + encodedText)
        .done(function(data) {

            var replyText = getReplyToIntent(data, userIntentText);
            if (isDialogRequiredIntent()) {
                handOffToDialog(userIntentText);
            }else {
                displayWatsonChat(replyText);
                displayWatsonChat("Is there anything else I can help you with?");
                saveConversation(userIntentText,intentType,replyText);
            }
        }).fail(function(response){
            console.log("StatusCode (" + response.status + "): " + response.statusText);
            displayWatsonChat("I'm unable to process your request at the moment.");
        });
}

function scrollToBottom (){
    $('body, html').animate({ scrollTop: $('body').height() + 'px' });
}

function updateScroll(){
    var element = document.getElementById("conversation-flow-container");
    element.scrollTop = element.scrollHeight;
}
