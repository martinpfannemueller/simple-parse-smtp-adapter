"use strict";
const path = require('path');
const nodemailer = require("nodemailer");
const EmailTemplate = require('email-templates');

const SimpleParseSmtpAdapter = (adapterOptions) => {

    if (!adapterOptions) {
        throw 'SimpleParseSMTPAdapter requires adapter options';
    } else if (adapterOptions.service == 'OAuth2Gmail') {
        if (!adapterOptions || !adapterOptions.service|| !adapterOptions.type || !adapterOptions.user || !adapterOptions.fromAddress || 
            !adapterOptions.clientId || !adapterOptions.clientSecret|| !adapterOptions.refreshToken || !adapterOptions.accessToken ) {
            throw 'Gmail API Adapter requires service, type, fromAddress, user, clientId, clientSecret, refreshToken and accessToken';
        }
    } else if (adapterOptions.service == 'SMTP') {
        if (!adapterOptions || !adapterOptions.user || !adapterOptions.password || !adapterOptions.host || !adapterOptions.secure || !adapterOptions.fromAddress ) {
            throw 'SimpleParseSMTPAdapter requires user, password, host and fromAddress';
        }
    } else {
        if (!adapterOptions || !adapterOptions.user || !adapterOptions.password || !adapterOptions.service || !adapterOptions.fromAddress) {
            throw 'SimpleParseSMTPAdapter please choose a supported service (OAuth2Gmail, SMTP, or other) and enter user, password and fromAddress';
        }
    }

    /**
     * Creates trasporter for OAuth2 Gmail
     */
    let transporterOAuth2Gmail = nodemailer.createTransport({
        //service: adapterOptions.service,
        host: adapterOptions.host,
        port: adapterOptions.port,
        secure: adapterOptions.secure,
        auth: {
            type: adapterOptions.type,
            user: adapterOptions.user,
            clientId: adapterOptions.clientId,
            clientSecret: adapterOptions.clientSecret,
            refreshToken: adapterOptions.refreshToken,
            accessToken: adapterOptions.refreshToken,
            expires: adapterOptions.expires
        }
    });

    /**
     * Creates trasporter for SMTP
     */
     let transporterSMTP = nodemailer.createTransport({
        host: adapterOptions.host,
        port: adapterOptions.port,
        secure: adapterOptions.secure,
        name: adapterOptions.name || '127.0.0.1',
        auth: {
            user: adapterOptions.user,
            pass: adapterOptions.password
        },
        tls: {
            rejectUnauthorized: adapterOptions.isTlsRejectUnauthorized !== undefined ? adapterOptions.isTlsRejectUnauthorized : true
        }
    });


    /**
     * Creates trasporter for send emails with OAuth2 Gmail
     */
    let transporterGeneric = nodemailer.createTransport({
        service: adapterOptions.service,
        auth: {
            user: adapterOptions.user, // Your email id
            pass: adapterOptions.password // Your password }
        }
    });

    /**
     * When emailField is defined in adapterOptines return that field
     * if not return the field email and if is undefined returns username
     * 
     * @param Parse Object user
     * @return String email
     */
    let getUserEmail = (user) => {
        let email = user.get('email') || user.get('username');

        if (adapterOptions.emailField) {
            email = user.get(adapterOptions.emailField);
        }

        return email;
    };

    /**
     * Return an email template with data rendered using email-templates module
     * check module docs: https://github.com/niftylettuce/node-email-templates
     *
     * @param String template path template
     * @param Object data object with data for use in template
     */
    let renderTemplate = (template, data) => {
        const templateDir = template;
        let emailTemplate = new EmailTemplate();

        return new Promise((resolve, reject) => {
            emailTemplate.renderAll(templateDir, data)
            .then((result) => {
                resolve(result);
            })
            .catch((err) => {
                console.error(err);
                reject(err);
            });
        });
    };

    /**
     * Parse use this function by default for sends emails
     * @param mail This object contain to address, subject and email text in plain text
     * @returns {Promise}
     */
    let sendMail = (mail) => {
        let mailOptions = {
            to: mail.to,
            html: mail.html,
            text: mail.text,
            subject: mail.subject,
            from: adapterOptions.fromAddress
        };

        return new Promise((resolve, reject) => {

            try {
                let selectedTransporter;

                if (adapterOptions.service == 'OAuth2Gmail') { 
                    selectedTransporter = transporterOAuth2Gmail;
                } else if(adapterOptions.service == 'SMTP') {
                    selectedTransporter = transporterSMTP;
                } else {
                    selectedTransporter = transporterGeneric;
                }

                selectedTransporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error(error);
                        reject(error);
                    } else {
                        resolve(info);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    };

    /**
     * Send email using a specif template file
     * @param data This object should contain {to}, {subject}, {template} and any variable that will be replaced in the template.
     * @returns {Promise}
     */
    let sendMailWithTemplate = (data) => {
        let mail = {
            to: data.to,
            subject: data.subject,
            from: adapterOptions.fromAddress
        };

        if (data.template) {
            return renderTemplate(data.template, data).then((result) => {
                mail.html = result.html;
                mail.text = result.text;

                return sendMail(mail);
            }, (e) => {

                return new Promise((resolve, reject) => {
                    console.error(e);
                    reject(e);
                });
            });

        } else {
            return new Promise((resolve, reject) => {
                reject('Template variable not specified');
            });
        }
    };

    /**
     * When this method is available parse use for send email for reset password
     * @param data This object contain {appName}, {link} and {user} user is an object parse of User class
     * @returns {Promise}
     */
    let sendPasswordResetEmail = (data) => {
        let mail = {
            subject: 'Reset Password',
            to: getUserEmail(data.user)
        };

        if (adapterOptions.templates && adapterOptions.templates.resetPassword) {

            return renderTemplate(adapterOptions.templates.resetPassword.template, data)
            .then((result) => {
                mail.html = result.html;
                mail.text = result.text;
                mail.subject = adapterOptions.templates.resetPassword.subject;

                return sendMail(mail);
            })
            .catch((error) => {
                return new Promise((resolve, reject) => {
                    console.error(error);
                    reject(error);
                });
            });
        } else {
            mail.text = data.link;

            return sendMail(mail);
        }
    };

    /**
     * When this method is available parse use for send email for email verification
     * @param data This object contain {appName}, {link} and {user} user is an object parse of User class
     * @returns {Promise}
     */
    let sendVerificationEmail = (data) => {
        let mail = {
            subject: 'Verify Email',
            to: getUserEmail(data.user)
        };

        if (adapterOptions.templates && adapterOptions.templates.verifyEmail) {

            return renderTemplate(adapterOptions.templates.verifyEmail.template, data)
            .then((result) => {
                mail.html = result.html;
                mail.text = result.text;
                mail.subject = adapterOptions.templates.verifyEmail.subject;

                return sendMail(mail);
            }).catch((error) => {

                return new Promise((resolve, reject) => {
                    console.error(error);
                    reject(error);
                });
            });

        } else {
            mail.text = data.link;

            return sendMail(mail);
        }
    };

    return Object.freeze({
        sendMail: sendMail,
        renderTemplate: renderTemplate,
        sendMailWithTemplate: sendMailWithTemplate,
        sendPasswordResetEmail: sendPasswordResetEmail,
        sendVerificationEmail: sendVerificationEmail
    });
};

module.exports = SimpleParseSmtpAdapter;
