"use strict";
const nodemailer = require("nodemailer");
const EmailTemplate = require('email-templates');
const _ = require('lodash');

const SimpleParseSmtpAdapter = (adapterOptions) => {

    if (!adapterOptions) {
        throw 'SimpleParseSMTPAdapter requires adapter options';
    } else if (adapterOptions.service == 'OAuth2Gmail') {
        if (_.isUndefined(adapterOptions) || _.isUndefined(adapterOptions.service) || _.isUndefined(adapterOptions.type) || _.isUndefined(adapterOptions.user) || _.isUndefined(adapterOptions.fromAddress) || 
        _.isUndefined(adapterOptions.clientId) || _.isUndefined(adapterOptions.clientSecret) || _.isUndefined(adapterOptions.refreshToken) || _.isUndefined(adapterOptions.accessToken) ) {
            throw 'Gmail API Adapter requires service, type, fromAddress, user, clientId, clientSecret, refreshToken and accessToken';
        }
    } else if (adapterOptions.service == 'SMTP') {
        if ( _.isUndefined(adapterOptions) || _.isUndefined(adapterOptions.user) || _.isUndefined(adapterOptions.password) || _.isUndefined(adapterOptions.host) || _.isUndefined(adapterOptions.secure) || _.isUndefined(adapterOptions.fromAddress) ) {
            throw 'SimpleParseSMTPAdapter requires user, password, host and fromAddress';
        }
    } else {
        if (_.isUndefined(adapterOptions) || _.isUndefined(adapterOptions.user) || _.isUndefined(adapterOptions.password) || _.isUndefined(adapterOptions.service) || _.isUndefined(adapterOptions.fromAddress) ) {
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
        requireTLS: adapterOptions.requireTLS || false,
        tls: adapterOptions.tls,
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
     * Creates trasporter to send emails with OAuth2 Gmail
     */
    let transporterGeneric = nodemailer.createTransport({
        service: adapterOptions.service,
        auth: {
            user: adapterOptions.user, // Your email id
            pass: adapterOptions.password // Your password }
        }
    });

    /**
     * When emailField is defined in adapterOptions return that field
     * if not return the field email and if is undefined returns username
     * 
     * @param Parse Object user
     * @return String email
     */
    const getUserEmail = (user) => {
        let email = user.get('email') || user.get('username');

        if (adapterOptions.emailField) {
            email = user.get(adapterOptions.emailField);
        }

        return email;
    };

    const getUserLocale = async (data) => {        
        let userData;

        // Parse doesn't pass all user attributes when 
        if (data.user && data.user.get('language') === undefined) {
            const parseUserQuery = new Parse.Query(Parse.User);
            parseUserQuery.equalTo('email', data.user.get('email'))
    
            userData = await parseUserQuery.first({useMasterKey: true});
        } else if (data.user) {
            userData = data.user;
        }

        if (userData && userData.get('language')) {
            if (userData.get('language') === 'english') {
                return 'en';
            } else if (userData.get('language') === 'french') {
                return 'fr';
            } else {
                return userData.get('language');
            }
        } else if (data.locale) {
            if (data.locale === 'english') {
                return 'en';
            } else if (data.locale === 'french') {
                return 'fr';
            } else {
                return data.locale;
            }
        } else {
            return 'en';
        }
    }

    /**
     * Return an email template with data rendered using email-templates module
     * check module docs: https://github.com/niftylettuce/node-email-templates
     *
     * @param String template path template
     * @param Object data object with data for use in template
     */
    const renderTemplate = async (template, data) => {
        const templateDir = template;

        let emailTemplate;

        if (adapterOptions.i18n) {
            const userLocale = await getUserLocale(data);

            if (userLocale) {
                //data.locals = { locale: userLocale };
                adapterOptions.i18n.defaultLocale = userLocale;
            }

            emailTemplate = new EmailTemplate({i18n: adapterOptions.i18n});
        } else {
            emailTemplate = new EmailTemplate();
        }

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
    const sendMail = (mail) => {
        let mailOptions = {
            to: mail.to,
            html: mail.html,
            text: mail.text,
            subject: mail.subject,
            from: adapterOptions.fromAddress,
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

                // Skip sending emails to blacklisted domains
                if (adapterOptions.blacklistedDomains) {
                    const domain = mailOptions.to.split('@').pop();
                    if (adapterOptions.blacklistedDomains.includes(domain)) {
                        const message = `Skipped sending email to ${mailOptions.to} as domain ${domain} is blacklisted.`;
                        console.log(message);
                        resolve(message);
                    }
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
     * Send email using a specific template file
     * @param data This object should contain {to}, {subject}, {template} and any variable that will be replaced in the template.
     * @returns {Promise}
     */
    const sendMailWithTemplate = (data) => {
        let mail = {
            to: data.to,
            subject: data.subject,
            from: adapterOptions.fromAddress,
        };

        if (data.template) {
            return renderTemplate(data.template, data).then((result) => {
                mail.html = result.html;
                mail.text = result.text;

                if (result.subject) {
                    mail.subject = result.subject;
                }

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
    const sendPasswordResetEmail = (data) => {
        let mail = {
            subject: 'Reset Password',
            to: getUserEmail(data.user),
        };

        if (adapterOptions.templates && adapterOptions.templates.resetPassword) {

            return renderTemplate(adapterOptions.templates.resetPassword.template, data)
            .then((result) => {
                mail.html = result.html;
                mail.text = result.text;

                if (result.subject) {
                    mail.subject = result.subject;
                } else {
                    mail.subject = adapterOptions.templates.resetPassword.subject;
                }

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
    const sendVerificationEmail = async (data) => {
        let mail = {
            subject: 'Verify Email',
            to: getUserEmail(data.user),
        };

        if (adapterOptions.templates && adapterOptions.templates.verifyEmail) {

            return renderTemplate(adapterOptions.templates.verifyEmail.template, data)
            .then((result) => {

                mail.html = result.html;
                mail.text = result.text;

                if (result.subject) {
                    mail.subject = result.subject;
                } else {
                    mail.subject = adapterOptions.templates.verifyEmail.subject;
                }
                
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
