#!groovy

properties([disableConcurrentBuilds()])

pipeline {
    
    environment {
        registry = "matchoffice/prerender"
        registryCredential = 'docker-hub-credentials'
        } 

    agent { 
        label 'master'
        }
    triggers { pollSCM('H/5 * * * *') }
    options {
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '10'))
        timestamps()
    }
    stages {
        stage("Docker login") {
            agent {label 'master' && 'services' }
            steps {
                echo ' ============== docker login =================='
                withCredentials([usernamePassword(credentialsId: 'docker-hub-credentials', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                    sh """
                    docker login -u $USERNAME -p $PASSWORD
                    """
                }
            }
        }
        stage ("Git-repo clone and make git-archive") {
            steps {
                echo '================== Git Clone ==============='
                git branch: 'master', credentialsId: 'git-hub-credentials', url: 'https://github.com/lokalebasen/prerender.git' 
                sh """
                    git archive --format tar HEAD > git_repo.tar
                   """
            }
        }


        stage ("Build Docker Image") {
            steps {
                echo '================== Build Images ==============='
                script {
                dockerImageLatest = docker.build registry + ":latest"
                dockerImageBuildNumber = docker.build registry + ":$BUILD_NUMBER"
                }
        
            }
        }

        stage('Push Images To DockerHub') {
            steps{
                echo '================== Push Image to DockerHub ==============='
                script {
                docker.withRegistry( '', registryCredential ) {
                dockerImageLatest.push()
                dockerImageBuildNumber.push()
                    }   
                }
            }
        }

        stage ("Pull Image From Docker Hub") {
            agent {label 'services'}

            steps {
                echo '================== Pull Image From Docker Hub ==============='
                script {
                docker.withRegistry( '', registryCredential ) {
                dockerImageLatest.pull()
                    }   
                }
            } 
        }


        stage ("Run Ansible") {
            steps {
                echo 'Run Ansible'
                sh """
                ansible -i ansible/hosts -m ping all
                ansible-playbook ansible/playbooks/deploy.yml -i ansible/hosts
                """ 
            } 
        }

    }    
}